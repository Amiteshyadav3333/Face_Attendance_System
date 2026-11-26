package com.faceattendance;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.database.ContentObserver;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;

import org.json.JSONException;
import org.json.JSONObject;

final class AttendanceLocation {
    static final int PERMISSION_REQUEST = 4;
    private static final long LOCATION_TIMEOUT_MS = 25000;
    private static final long MAX_FIX_AGE_MS = 10000;

    private final Activity activity;
    private final LocationManager manager;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable timeout = this::finishLocation;
    private final ContentObserver developerObserver = new ContentObserver(handler) {
        @Override
        public void onChange(boolean selfChange) {
            if (pendingId != 0 && developerOptionsEnabled()) {
                finish(null, developerOptionsMessage());
            }
        }
    };
    private final LocationListener listener = new LocationListener() {
        @Override
        public void onLocationChanged(Location location) {
            acceptFix(location);
        }

        @Override public void onProviderEnabled(String provider) {}
        @Override public void onProviderDisabled(String provider) {}
        @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
    };

    private WebMessagePort port;
    private int pendingId;
    private Location bestFix;
    private float accuracyTarget;
    private boolean foreground;

    AttendanceLocation(Activity activity) {
        this.activity = activity;
        manager = activity.getSystemService(LocationManager.class);
    }

    void connect(WebMessagePort nextPort) {
        closePort();
        port = nextPort;
        port.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override
            public void onMessage(WebMessagePort source, WebMessage message) {
                if (source == port) handleRequest(message.getData());
            }
        }, handler);
    }

    void onResume() {
        foreground = true;
        activity.getContentResolver().registerContentObserver(
                Settings.Global.getUriFor(Settings.Global.DEVELOPMENT_SETTINGS_ENABLED),
                false, developerObserver);
        if (pendingId != 0 && developerOptionsEnabled()) finish(null, developerOptionsMessage());
    }

    void onPause() {
        foreground = false;
        activity.getContentResolver().unregisterContentObserver(developerObserver);
        if (pendingId != 0 && hasPrecisePermission()) {
            finish(null, "Keep Face Attendance open while it checks your location.");
        }
    }

    void closePort() {
        clearLocation();
        if (port != null) {
            port.close();
            port = null;
        }
    }

    void onPermissionResult() {
        if (pendingId == 0) return;
        if (!hasPrecisePermission()) {
            finish(null, "Allow Precise location in Android app permissions and try again.");
        } else {
            startLocation();
        }
    }

    private void handleRequest(String message) {
        if (message == null || message.length() > 256) return;
        try {
            JSONObject request = new JSONObject(message);
            int id = request.getInt("id");
            String operation = request.getString("operation");
            if (id <= 0) return;
            if (!foreground) {
                reply(id, null, "Open Face Attendance before using attendance.");
            } else if (developerOptionsEnabled()) {
                reply(id, null, developerOptionsMessage());
            } else if ("check".equals(operation)) {
                reply(id, null, null);
            } else if ("location".equals(operation)) {
                if (pendingId != 0) {
                    reply(id, null, "A location check is already running.");
                    return;
                }
                pendingId = id;
                accuracyTarget = (float) Math.max(15, Math.min(100, request.optDouble("accuracy", 75)));
                if (hasPrecisePermission()) {
                    startLocation();
                } else {
                    activity.requestPermissions(new String[]{
                            Manifest.permission.ACCESS_FINE_LOCATION,
                            Manifest.permission.ACCESS_COARSE_LOCATION,
                    }, PERMISSION_REQUEST);
                }
            }
        } catch (JSONException ignored) {
            // Ignore invalid messages from the web client.
        }
    }

    private boolean hasPrecisePermission() {
        return activity.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)
                == PackageManager.PERMISSION_GRANTED;
    }

    private boolean developerOptionsEnabled() {
        return Settings.Global.getInt(activity.getContentResolver(),
                Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0) != 0;
    }

    private static String developerOptionsMessage() {
        return "Turn off Developer options in Android Settings before using attendance.";
    }

    private void startLocation() {
        if (developerOptionsEnabled()) {
            finish(null, developerOptionsMessage());
            return;
        }
        if (manager == null) {
            finish(null, "Location is unavailable on this phone.");
            return;
        }
        boolean listening = false;
        try {
            for (String provider : manager.getProviders(true)) {
                if (LocationManager.PASSIVE_PROVIDER.equals(provider)) continue;
                manager.requestLocationUpdates(provider, 1000, 0, listener, Looper.getMainLooper());
                listening = true;
                Location lastFix = manager.getLastKnownLocation(provider);
                if (lastFix != null) acceptFix(lastFix);
                if (pendingId == 0) return;
            }
        } catch (SecurityException error) {
            finish(null, "Allow Precise location in Android app permissions and try again.");
            return;
        }
        if (listening) handler.postDelayed(timeout, LOCATION_TIMEOUT_MS);
        else finish(null, "Turn on Location in Android Settings and try again.");
    }

    private void acceptFix(Location fix) {
        if (pendingId == 0) return;
        if (developerOptionsEnabled()) {
            finish(null, developerOptionsMessage());
            return;
        }
        long ageMs = (SystemClock.elapsedRealtimeNanos() - fix.getElapsedRealtimeNanos()) / 1000000L;
        if (ageMs > MAX_FIX_AGE_MS || !fix.hasAccuracy()) return;
        if (Build.VERSION.SDK_INT >= 31 ? fix.isMock() : fix.isFromMockProvider()) {
            finish(null, "Mock location detected. Turn off the mock location app and try again.");
            return;
        }
        if (bestFix == null || fix.getAccuracy() < bestFix.getAccuracy()) bestFix = fix;
        if (fix.getAccuracy() <= accuracyTarget && foreground) finish(fix, null);
    }

    private void finishLocation() {
        if (developerOptionsEnabled()) {
            finish(null, developerOptionsMessage());
        } else {
            finish(null, bestFix == null
                    ? "Location timed out. Turn on Location and try near a window or outdoors."
                    : "Location is not precise enough. Move near a window or outdoors and try again.");
        }
    }

    private void clearLocation() {
        pendingId = 0;
        bestFix = null;
        handler.removeCallbacks(timeout);
        if (manager != null) manager.removeUpdates(listener);
    }

    private void finish(Location location, String error) {
        int id = pendingId;
        clearLocation();
        if (id != 0) reply(id, location, error);
    }

    private void reply(int id, Location location, String error) {
        if (port == null) return;
        try {
            JSONObject result = new JSONObject().put("id", id);
            if (error != null) result.put("error", error);
            if (location != null) {
                result.put("latitude", location.getLatitude())
                      .put("longitude", location.getLongitude())
                      .put("accuracy", location.getAccuracy());
            }
            port.postMessage(new WebMessage(result.toString()));
        } catch (JSONException | IllegalStateException ignored) {
            // The page may have navigated away while location was being resolved.
        }
    }
}
