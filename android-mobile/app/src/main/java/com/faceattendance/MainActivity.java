package com.faceattendance;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebMessage;
import android.webkit.WebMessagePort;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class MainActivity extends Activity {
    private static final String BUNDLED_HOST = "appassets.androidplatform.net";
    private static final int WEB_MEDIA = 1;
    private static final int PICK_IMAGE = 2;
    private static final int SAVE_CSV = 3;
    private static final int MAX_CSV_BYTES = 8 * 1024 * 1024;

    private final ExecutorService fileWriter = Executors.newSingleThreadExecutor();
    private WebView browser;
    private Uri frontend;
    private LinearLayout errorPanel;
    private TextView errorMessage;
    private PermissionRequest mediaRequest;
    private ValueCallback<Uri[]> imagePicker;
    private WebMessagePort exportPort;
    private byte[] pendingFile;
    private AttendanceLocation attendanceLocation;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
        attendanceLocation = new AttendanceLocation(this);
        frontend = Uri.parse(BuildConfig.ATTENDANCE_URL);
        browser = new WebView(this);
        browser.getSettings().setJavaScriptEnabled(true);
        browser.getSettings().setDomStorageEnabled(true);
        browser.getSettings().setAllowFileAccess(false);
        browser.getSettings().setAllowContentAccess(true);
        browser.getSettings().setUserAgentString(browser.getSettings().getUserAgentString()
                + " FaceAttendanceAndroid");
        browser.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (BUNDLED_HOST.equals(frontend.getHost()) && sameOrigin(request.getUrl())) {
                    return bundledResource(request);
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && !sameOrigin(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (sameOrigin(Uri.parse(url)) && errorPanel.getVisibility() != View.VISIBLE) {
                    connectExport();
                    WebMessagePort[] ports = browser.createWebMessageChannel();
                    attendanceLocation.connect(ports[0]);
                    Uri origin = Uri.parse(frontend.getScheme() + "://" + frontend.getEncodedAuthority());
                    browser.postWebMessage(new WebMessage("face-attendance-device", new WebMessagePort[]{ports[1]}), origin);
                }
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame()) {
                    showError("The attendance server returned HTTP " + response.getStatusCode() + ".");
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    showError("Could not open Face Attendance. Check the server and try again.");
                }
            }
        });
        browser.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(PermissionRequest request) {
                if (mediaRequest != null || !sameOrigin(request.getOrigin())) {
                    request.deny();
                    return;
                }
                List<String> missing = new ArrayList<>();
                for (String resource : request.getResources()) {
                    String permission = mediaPermission(resource);
                    if (permission != null && checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) {
                        missing.add(permission);
                    }
                }
                if (missing.isEmpty()) {
                    grantMedia(request);
                } else {
                    mediaRequest = request;
                    requestPermissions(missing.toArray(new String[0]), WEB_MEDIA);
                }
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (mediaRequest == request) {
                    mediaRequest = null;
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if ((view.getUrl() == null || !sameOrigin(Uri.parse(view.getUrl()))) || imagePicker != null) {
                    return false;
                }
                imagePicker = callback;
                Intent picker = params.createIntent();
                try {
                    startActivityForResult(picker, PICK_IMAGE);
                } catch (ActivityNotFoundException error) {
                    imagePicker = null;
                    callback.onReceiveValue(null);
                }
                return true;
            }
        });

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setFitsSystemWindows(true);
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorMessage = new TextView(this);
        Button retry = new Button(this);
        retry.setText("Retry");
        retry.setOnClickListener(view -> openFrontend());
        errorPanel.addView(errorMessage);
        errorPanel.addView(retry);
        root.addView(errorPanel);
        root.addView(browser, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(root);
        openFrontend();
    }

    private WebResourceResponse bundledResource(WebResourceRequest request) {
        Uri url = request.getUrl();
        String path = url.getPath();
        if (path == null || path.contains("..") || path.contains("\\")
                || !"GET".equals(request.getMethod())) {
            return bundledNotFound();
        }
        if (path.equals("/") || path.equals("/login") || path.equals("/dashboard")
                || path.startsWith("/projects/share/")) {
            path = "/index.html";
        }

        try {
            InputStream data = getAssets().open("web" + path);
            String extension = MimeTypeMap.getFileExtensionFromUrl(path);
            String mimeType = extension.equals("js") ? "application/javascript"
                    : MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
            return new WebResourceResponse(mimeType == null ? "application/octet-stream" : mimeType,
                    "UTF-8", data);
        } catch (IOException error) {
            return bundledNotFound();
        }
    }

    private static WebResourceResponse bundledNotFound() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                java.util.Collections.emptyMap(), null);
    }

    private void openFrontend() {
        if (frontend.getHost() == null) {
            showError("Set the attendance server URL when building the app.");
            return;
        }
        errorPanel.setVisibility(View.GONE);
        browser.setVisibility(View.VISIBLE);
        browser.loadUrl(frontend.toString());
    }

    private void showError(String message) {
        browser.setVisibility(View.GONE);
        errorMessage.setText(message);
        errorPanel.setVisibility(View.VISIBLE);
    }

    private boolean sameOrigin(Uri url) {
        return url != null && frontend.getHost() != null && frontend.getScheme() != null && frontend.getScheme().equals(url.getScheme())
                && frontend.getHost().equalsIgnoreCase(url.getHost())
                && originPort(frontend) == originPort(url);
    }

    private static int originPort(Uri uri) {
        if (uri.getPort() >= 0) {
            return uri.getPort();
        }
        return "https".equals(uri.getScheme()) ? 443 : 80;
    }

    private void connectExport() {
        if (exportPort != null) {
            exportPort.close();
        }
        WebMessagePort[] ports = browser.createWebMessageChannel();
        exportPort = ports[0];
        exportPort.setWebMessageCallback(new WebMessagePort.WebMessageCallback() {
            @Override
            public void onMessage(WebMessagePort port, WebMessage message) {
                receiveExport(message.getData());
            }
        });
        Uri origin = Uri.parse(frontend.getScheme() + "://" + frontend.getEncodedAuthority());
        browser.postWebMessage(new WebMessage("face-attendance-export", new WebMessagePort[]{ports[1]}), origin);
    }

    private void receiveExport(String message) {
        if (pendingFile != null || message == null || message.length() > MAX_CSV_BYTES * 2) {
            return;
        }
        try {
            JSONObject export = new JSONObject(message);
            String filename = export.getString("filename");
            boolean attachment = export.has("attachment");
            String mime = "text/csv";
            byte[] contents;
            if (attachment) {
                filename = filename.replaceAll("[\\p{Cntrl}/\\\\]", "_").trim();
                if (filename.isEmpty() || filename.equals(".") || filename.equals("..")) filename = "attachment";
                if (filename.length() > 180) filename = filename.substring(0, 180);
                contents = Base64.decode(export.getString("attachment"), Base64.DEFAULT);
                mime = "application/octet-stream";
            } else {
                if (!filename.matches("(my_)?attendance_[0-9]{4}-[0-9]{2}-[0-9]{2}\\.csv")) {
                    toast("This attendance report could not be saved.");
                    return;
                }
                contents = export.getString("contents").getBytes(StandardCharsets.UTF_8);
            }
            if (contents.length > MAX_CSV_BYTES) {
                toast("This file is too large to save.");
                return;
            }
            pendingFile = contents;
            startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType(mime)
                    .putExtra(Intent.EXTRA_TITLE, filename), SAVE_CSV);
        } catch (Exception error) {
            pendingFile = null;
            toast("Could not open the Android file picker.");
        }
    }

    private static String mediaPermission(String resource) {
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resource)) return Manifest.permission.CAMERA;
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(resource)) return Manifest.permission.RECORD_AUDIO;
        return null;
    }

    private void grantMedia(PermissionRequest request) {
        List<String> granted = new ArrayList<>();
        for (String resource : request.getResources()) {
            String permission = mediaPermission(resource);
            if (permission != null && checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED) {
                granted.add(resource);
            }
        }
        if (granted.isEmpty()) request.deny();
        else request.grant(granted.toArray(new String[0]));
    }

    @Override
    protected void onResume() {
        super.onResume();
        attendanceLocation.onResume();
    }

    @Override
    protected void onPause() {
        attendanceLocation.onPause();
        super.onPause();
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == WEB_MEDIA && mediaRequest != null) {
            grantMedia(mediaRequest);
            mediaRequest = null;
        }
        if (requestCode == AttendanceLocation.PERMISSION_REQUEST) attendanceLocation.onPermissionResult();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_IMAGE && imagePicker != null) {
            imagePicker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            imagePicker = null;
        }
        if (requestCode == SAVE_CSV) {
            byte[] contents = pendingFile;
            pendingFile = null;
            if (contents != null && resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri destination = data.getData();
                fileWriter.execute(() -> writeFile(destination, contents));
            }
        }
    }

    private void writeFile(Uri destination, byte[] contents) {
        try (OutputStream output = getContentResolver().openOutputStream(destination)) {
            if (output == null) {
                throw new IOException("Destination is unavailable");
            }
            output.write(contents);
        } catch (IOException | SecurityException error) {
            runOnUiThread(() -> toast("Could not save the file."));
            return;
        }
        runOnUiThread(() -> toast("File saved."));
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    @Override
    public void onBackPressed() {
        if (browser.getVisibility() == View.VISIBLE && browser.canGoBack()) {
            browser.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        if (mediaRequest != null) {
            mediaRequest.deny();
        }
        if (imagePicker != null) {
            imagePicker.onReceiveValue(null);
        }
        if (exportPort != null) {
            exportPort.close();
        }
        attendanceLocation.closePort();
        fileWriter.shutdown();
        browser.destroy();
        super.onDestroy();
    }
}
