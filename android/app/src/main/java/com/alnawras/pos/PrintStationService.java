package com.alnawras.pos;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.webkit.WebView;

import androidx.core.app.NotificationCompat;

import java.lang.ref.WeakReference;

/**
 * Keeps the print station working while another app is in front (or the screen is off).
 * Android pauses a background app's page and battery savers freeze or close it; a foreground
 * service (with its permanent notification) keeps the app running, and every 5 seconds this
 * tells the page to check for tickets to print (window.__smartposStationTick, PrintStation.ts).
 * It cannot help if the app is swiped away from the recent apps: the page is gone then.
 */
public class PrintStationService extends Service {
    private static final String CHANNEL = "print_station";
    private static final long TICK_MS = 5000;
    static WeakReference<WebView> webView = new WeakReference<>(null);

    private final Handler handler = new Handler(Looper.getMainLooper());
    private PowerManager.WakeLock wakeLock;

    private final Runnable tick = new Runnable() {
        @Override public void run() {
            WebView w = webView.get();
            if (w != null) w.evaluateJavascript("window.__smartposStationTick && window.__smartposStationTick()", null);
            handler.postDelayed(this, TICK_MS);
        }
    };

    static void start(Context ctx, WebView w) {
        webView = new WeakReference<>(w);
        Intent i = new Intent(ctx, PrintStationService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) ctx.startForegroundService(i); else ctx.startService(i);
    }

    static void stop(Context ctx) {
        ctx.stopService(new Intent(ctx, PrintStationService.class));
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(new NotificationChannel(CHANNEL, "Print station", NotificationManager.IMPORTANCE_LOW));
        }
        PendingIntent open = PendingIntent.getActivity(this, 0,
            new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE);
        Notification n = new NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("SmartPos print station is on")
            .setContentText("Printing waiter orders. Keep SmartPos open in the background.")
            .setOngoing(true)
            .setContentIntent(open)
            .build();
        if (Build.VERSION.SDK_INT >= 34) startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
        else startForeground(1, n);

        if (wakeLock == null) {
            // CPU stays on with the screen off, so tickets keep printing (released when the station stops).
            wakeLock = ((PowerManager) getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "SmartPos:printStation");
            wakeLock.acquire();
        }
        handler.removeCallbacks(tick);
        handler.post(tick);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        handler.removeCallbacks(tick);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        wakeLock = null;
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
