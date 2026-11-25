package com.faceattendance;

import android.Manifest;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
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
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

public final class MainActivity extends Activity {
    private static final int CAMERA = 1;
    private static final int PICK_IMAGE = 2;
    private static final int SAVE_CSV = 3;
    private static final int MAX_CSV_BYTES = 8 * 1024 * 1024;

    private final ExecutorService fileWriter = Executors.newSingleThreadExecutor();
    private WebView browser;
    private Uri frontend;
    private LinearLayout errorPanel;
    private TextView errorMessage;
    private PermissionRequest cameraRequest;
    private ValueCallback<Uri[]> imagePicker;
    private WebMessagePort exportPort;
    private String pendingCsv;

    @Override
    public void onCreate(Bundle state) {
        super.onCreate(state);
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
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return request.isForMainFrame() && !sameOrigin(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (sameOrigin(Uri.parse(url)) && errorPanel.getVisibility() != View.VISIBLE) {
                    connectExport();
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
                if (cameraRequest != null || !sameOrigin(request.getOrigin())
                        || !Arrays.asList(request.getResources()).contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)) {
                    request.deny();
                    return;
                }
                if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                    grantCamera(request);
                    return;
                }
                cameraRequest = request;
                requestPermissions(new String[]{Manifest.permission.CAMERA}, CAMERA);
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                if (cameraRequest == request) {
                    cameraRequest = null;
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if ((view.getUrl() == null || !sameOrigin(Uri.parse(view.getUrl()))) || imagePicker != null) {
                    return false;
                }
                imagePicker = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                        .addCategory(Intent.CATEGORY_OPENABLE)
                        .setType("image/*");
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
        if (pendingCsv != null || message == null || message.length() > MAX_CSV_BYTES * 2) {
            return;
        }
        try {
            JSONObject export = new JSONObject(message);
            String filename = export.getString("filename");
            String contents = export.getString("contents");
            if (!filename.matches("(my_)?attendance_[0-9]{4}-[0-9]{2}-[0-9]{2}\\.csv")
                    || contents.getBytes(StandardCharsets.UTF_8).length > MAX_CSV_BYTES) {
                toast("This attendance report could not be saved.");
                return;
            }
            pendingCsv = contents;
            startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .setType("text/csv")
                    .putExtra(Intent.EXTRA_TITLE, filename), SAVE_CSV);
        } catch (Exception error) {
            pendingCsv = null;
            toast("Could not open the Android file picker.");
        }
    }

    private void grantCamera(PermissionRequest request) {
        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == CAMERA && cameraRequest != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                grantCamera(cameraRequest);
            } else {
                cameraRequest.deny();
            }
            cameraRequest = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == PICK_IMAGE && imagePicker != null) {
            imagePicker.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            imagePicker = null;
        }
        if (requestCode == SAVE_CSV) {
            String contents = pendingCsv;
            pendingCsv = null;
            if (contents != null && resultCode == RESULT_OK && data != null && data.getData() != null) {
                Uri destination = data.getData();
                fileWriter.execute(() -> writeCsv(destination, contents));
            }
        }
    }

    private void writeCsv(Uri destination, String contents) {
        try (OutputStream output = getContentResolver().openOutputStream(destination)) {
            if (output == null) {
                throw new IOException("Destination is unavailable");
            }
            output.write(contents.getBytes(StandardCharsets.UTF_8));
        } catch (IOException | SecurityException error) {
            runOnUiThread(() -> toast("Could not save the attendance report."));
            return;
        }
        runOnUiThread(() -> toast("Attendance report saved."));
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
        if (cameraRequest != null) {
            cameraRequest.deny();
        }
        if (imagePicker != null) {
            imagePicker.onReceiveValue(null);
        }
        if (exportPort != null) {
            exportPort.close();
        }
        fileWriter.shutdown();
        browser.destroy();
        super.onDestroy();
    }
}
