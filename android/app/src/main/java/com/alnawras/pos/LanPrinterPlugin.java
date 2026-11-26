package com.alnawras.pos;

import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InterfaceAddress;
import java.net.NetworkInterface;
import java.net.Socket;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.TreeSet;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Sends raw ESC/POS bytes to a network (Ethernet/Wi-Fi) receipt printer on the
 * restaurant's own network, port 9100. A web page cannot open a TCP socket, so the
 * app does it here. Only private LAN IP addresses are accepted: the page must not be
 * able to make the tablet connect anywhere else.
 */
@CapacitorPlugin(name = "LanPrinter")
public class LanPrinterPlugin extends Plugin {
    private static final int TIMEOUT_MS = 4000;
    private static final int MAX_BYTES = 2 * 1024 * 1024;

    /** Print station on: keep the app running in the background (PrintStationService). */
    @PluginMethod
    public void startStation(PluginCall call) {
        android.webkit.WebView w = getBridge().getWebView();
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            // The page's process keeps its priority while the app is behind another app.
            w.setRendererPriorityPolicy(android.webkit.WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }
        // Android 13+: ask once to show the "print station is on" notification (the service runs either way).
        if (android.os.Build.VERSION.SDK_INT >= 33 && getContext().checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            getActivity().requestPermissions(new String[] { android.Manifest.permission.POST_NOTIFICATIONS }, 7101);
        }
        PrintStationService.start(getContext(), w);
        call.resolve();
    }

    @PluginMethod
    public void stopStation(PluginCall call) {
        PrintStationService.stop(getContext());
        call.resolve();
    }

    @PluginMethod
    public void print(PluginCall call) {
        String host = call.getString("host");
        int port = call.getInt("port", 9100);
        String data = call.getString("data");
        if (host == null || data == null) { call.reject("Missing printer address or ticket"); return; }
        if (!isPrivateLan(host.trim())) { call.reject("Printer address must be a local network IP, e.g. 192.168.1.50"); return; }
        if (port < 1 || port > 65535) { call.reject("Invalid printer port"); return; }
        final byte[] bytes;
        try { bytes = Base64.decode(data, Base64.DEFAULT); } catch (IllegalArgumentException e) { call.reject("Invalid ticket data"); return; }
        if (bytes.length > MAX_BYTES) { call.reject("Ticket too large"); return; }

        new Thread(() -> {
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host.trim(), port), TIMEOUT_MS);
                socket.setSoTimeout(TIMEOUT_MS);
                OutputStream out = socket.getOutputStream();
                out.write(bytes);
                out.flush();
                call.resolve();
            } catch (Exception e) {
                call.reject("Printer " + host + " is not reachable. Check it is on and on the same network.");
            }
        }).start();
    }

    private static final int SCAN_TIMEOUT_MS = 500;

    /**
     * Finds receipt printers on the tablet's own local network(s): every address of the
     * tablet's subnet (at most the /24 around it) that accepts a connection on port 9100.
     * Resolves { printers: [{ ip, port }], networks: ["192.168.1.0/24"] }.
     */
    @PluginMethod
    public void discover(PluginCall call) {
        new Thread(() -> {
            List<String> self = new ArrayList<>();
            TreeSet<Long> hosts = new TreeSet<>();
            TreeSet<String> networks = new TreeSet<>();
            try {
                for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                    if (!ni.isUp() || ni.isLoopback()) continue;
                    for (InterfaceAddress ia : ni.getInterfaceAddresses()) {
                        InetAddress addr = ia.getAddress();
                        if (!(addr instanceof Inet4Address) || !isPrivateLan(addr.getHostAddress())) continue;
                        self.add(addr.getHostAddress());
                        int prefix = Math.max(24, Math.min(30, ia.getNetworkPrefixLength()));
                        long ip = toLong(addr.getHostAddress());
                        long mask = (0xFFFFFFFFL << (32 - prefix)) & 0xFFFFFFFFL;
                        long net = ip & mask, bcast = net | (~mask & 0xFFFFFFFFL);
                        networks.add(toIp(net) + "/" + prefix);
                        for (long h = net + 1; h < bcast; h++) hosts.add(h);
                    }
                }
            } catch (Exception e) {
                call.reject("Could not read this tablet's network");
                return;
            }

            List<String> found = Collections.synchronizedList(new ArrayList<>());
            ExecutorService pool = Executors.newFixedThreadPool(64);
            for (long h : hosts) {
                String ip = toIp(h);
                if (self.contains(ip)) continue;
                pool.execute(() -> {
                    try (Socket s = new Socket()) {
                        s.connect(new InetSocketAddress(ip, 9100), SCAN_TIMEOUT_MS);
                        found.add(ip);
                    } catch (Exception ignored) { }
                });
            }
            pool.shutdown();
            try { pool.awaitTermination(30, TimeUnit.SECONDS); } catch (InterruptedException ignored) { }

            List<String> sorted = new ArrayList<>(found);
            sorted.sort((a, b) -> Long.compare(toLong(a), toLong(b)));
            JSArray printers = new JSArray();
            for (String ip : sorted) {
                JSObject p = new JSObject();
                p.put("ip", ip);
                p.put("port", 9100);
                printers.put(p);
            }
            JSObject res = new JSObject();
            res.put("printers", printers);
            res.put("networks", new JSArray(networks));
            call.resolve(res);
        }).start();
    }

    static long toLong(String ip) {
        long v = 0;
        for (String part : ip.split("\\.")) v = (v << 8) | Integer.parseInt(part);
        return v;
    }

    static String toIp(long v) {
        return ((v >> 24) & 255) + "." + ((v >> 16) & 255) + "." + ((v >> 8) & 255) + "." + (v & 255);
    }

    /** IPv4 literals in 10/8, 172.16/12, 192.168/16 or 169.254/16 only (no host names). */
    static boolean isPrivateLan(String host) {
        if (!host.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")) return false;
        String[] p = host.split("\\.");
        int a = Integer.parseInt(p[0]), b = Integer.parseInt(p[1]);
        for (String part : p) if (Integer.parseInt(part) > 255) return false;
        return a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) || (a == 169 && b == 254);
    }
}
