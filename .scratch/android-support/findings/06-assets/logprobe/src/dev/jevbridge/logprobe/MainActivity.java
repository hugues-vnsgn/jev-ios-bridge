package dev.jevbridge.logprobe;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;
import android.util.Log;
import android.widget.TextView;

/** Throwaway probe for ticket 06: writes every kind of app output, then misbehaves on request. */
public class MainActivity extends Activity {
    static final String TAG = "JevProbe";
    static volatile boolean ticking = false;

    @Override protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        String mode = getIntent().getStringExtra("mode");
        if (mode == null) mode = "normal";
        String secret = getIntent().getStringExtra("secret");
        TextView view = new TextView(this);
        view.setText("probe pid=" + Process.myPid() + " mode=" + mode);
        setContentView(view);

        Log.v(TAG, "verbose line");
        Log.d(TAG, "debug line");
        Log.i(TAG, "info line mode=" + mode + " pid=" + Process.myPid());
        Log.w(TAG, "warn line");
        Log.e(TAG, "error line");
        System.out.println("System.out println line");
        System.err.println("System.err line");
        Log.i(TAG, "multi-line first\nmulti-line second");
        Log.i(TAG, "unicode line: café ✓ Tiếng Việt");
        if (secret != null) Log.i(TAG, "secret is " + secret + " and upper " + secret.toUpperCase());
        Log.e(TAG, "handled exception", new IllegalArgumentException("handled boom"));

        if (!ticking) {
            ticking = true;
            Thread ticker = new Thread(() -> {
                for (int n = 1; ; n++) {
                    Log.i(TAG, "tick " + n + " epochMs=" + System.currentTimeMillis());
                    try { Thread.sleep(500); } catch (InterruptedException e) { return; }
                }
            }, "ticker");
            ticker.setDaemon(true);
            ticker.start();
        }

        final String chosen = mode;
        long delay = 3000;
        String delayExtra = getIntent().getStringExtra("delayMs");
        if (delayExtra != null) delay = Long.parseLong(delayExtra);
        new Handler(Looper.getMainLooper()).postDelayed(() -> misbehave(chosen), delay);
    }

    void misbehave(String mode) {
        Log.i(TAG, "misbehave " + mode + " at epochMs=" + System.currentTimeMillis());
        switch (mode) {
            case "crash": throw new IllegalStateException("probe crash on main thread");
            case "bgcrash":
                new Thread(() -> { throw new IllegalStateException("probe crash on background thread"); }, "bg").start();
                break;
            case "native": Process.sendSignal(Process.myPid(), 11); break;
            case "anr":
                try { Thread.sleep(40000); } catch (InterruptedException e) { }
                break;
            case "exit": System.exit(0); break;
            case "finish": finish(); break;
            default: break;
        }
    }
}
