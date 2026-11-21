package com.alnawras.pos;

import android.util.Base64;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;

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

    /** IPv4 literals in 10/8, 172.16/12, 192.168/16 or 169.254/16 only (no host names). */
    static boolean isPrivateLan(String host) {
        if (!host.matches("^\\d{1,3}(\\.\\d{1,3}){3}$")) return false;
        String[] p = host.split("\\.");
        int a = Integer.parseInt(p[0]), b = Integer.parseInt(p[1]);
        for (String part : p) if (Integer.parseInt(part) > 255) return false;
        return a == 10 || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168) || (a == 169 && b == 254);
    }
}
