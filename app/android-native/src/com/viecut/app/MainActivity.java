package com.viecut.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/** VIECUT cho Android: giao diện editor chạy trong WebView, dựng và xuất video ngay trên máy. */
public class MainActivity extends Activity {
    private static final int REQ_FILE = 1;
    private static final int REQ_PERM = 2;
    private WebView web;
    private ValueCallback<Uri[]> fileCb;

    // trạng thái lưu video đang xuất
    private OutputStream saveOut;
    private Uri saveUri;
    private File saveFile;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(23, 24, 29));
        getWindow().setNavigationBarColor(Color.rgb(23, 24, 29));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(15, 16, 20));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String u) {
                if (u.startsWith("file:")) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(u))); } catch (Exception ignored) { }
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams p) {
                if (fileCb != null) fileCb.onReceiveValue(null);
                fileCb = cb;
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"video/*", "audio/*", "image/*"});
                i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(i, "Chọn video, ảnh, nhạc"), REQ_FILE);
                } catch (Exception e) {
                    fileCb = null;
                    return false;
                }
                return true;
            }
        });
        web.addJavascriptInterface(new Bridge(), "AndroidBridge");

        if (state != null) web.restoreState(state);
        else web.loadUrl("file:///android_asset/www/index.html");

        if (Build.VERSION.SDK_INT < 29
                && checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERM);
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        if (req == REQ_FILE && fileCb != null) {
            Uri[] out = null;
            if (res == RESULT_OK && data != null) {
                ClipData cd = data.getClipData();
                if (cd != null) {
                    out = new Uri[cd.getItemCount()];
                    for (int k = 0; k < cd.getItemCount(); k++) out[k] = cd.getItemAt(k).getUri();
                } else if (data.getData() != null) {
                    out = new Uri[]{data.getData()};
                }
            }
            fileCb.onReceiveValue(out);
            fileCb = null;
            return;
        }
        super.onActivityResult(req, res, data);
    }

    @Override
    protected void onSaveInstanceState(Bundle out) {
        super.onSaveInstanceState(out);
        web.saveState(out);
    }

    @Override
    public void onBackPressed() {
        // Trong editor: nút Quay lại = về danh sách dự án. Ở màn hình khác: thoát app.
        web.evaluateJavascript("(function(){var b=document.getElementById('backBtn');var e=document.getElementById('editor');"
                + "if(e&&!e.classList.contains('hidden')&&b){b.click();return 'y';}return 'n';})()", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if (!"\"y\"".equals(v)) MainActivity.super.onBackPressed();
            }
        });
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** Hàm cho JavaScript gọi: lưu video đã xuất vào thư viện máy (Movies/VIECUT). Trả về "" nếu ổn, hoặc lời báo lỗi. */
    private class Bridge {
        @JavascriptInterface
        public String saveBegin(String name, String mime) {
            try {
                closeQuiet();
                if (mime == null || mime.isEmpty()) mime = "video/mp4";
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put("relative_path", Environment.DIRECTORY_MOVIES + "/VIECUT");
                    v.put("is_pending", 1);
                    ContentResolver cr = getContentResolver();
                    saveUri = cr.insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, v);
                    if (saveUri == null) return "Không tạo được file video";
                    saveOut = cr.openOutputStream(saveUri);
                } else {
                    if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                        runOnUiThread(new Runnable() {
                            public void run() {
                                requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERM);
                            }
                        });
                        return "Hãy cho phép quyền lưu trữ rồi bấm Tải video lần nữa";
                    }
                    File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_MOVIES), "VIECUT");
                    dir.mkdirs();
                    saveFile = new File(dir, name);
                    saveOut = new FileOutputStream(saveFile);
                }
                return "";
            } catch (Exception e) {
                closeQuiet();
                return "Lỗi lưu video: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public String saveChunk(String b64) {
            try {
                if (saveOut == null) return "Chưa bắt đầu lưu";
                saveOut.write(Base64.decode(b64, Base64.DEFAULT));
                return "";
            } catch (Exception e) {
                closeQuiet();
                return "Lỗi ghi video: " + e.getMessage();
            }
        }

        @JavascriptInterface
        public String saveEnd() {
            try {
                if (saveOut != null) saveOut.close();
                saveOut = null;
                if (saveUri != null) {
                    ContentValues v = new ContentValues();
                    v.put("is_pending", 0);
                    getContentResolver().update(saveUri, v, null, null);
                    saveUri = null;
                }
                if (saveFile != null) {
                    MediaScannerConnection.scanFile(MainActivity.this, new String[]{saveFile.getAbsolutePath()}, null, null);
                    saveFile = null;
                }
                return "Đã lưu vào thư viện: Movies/VIECUT";
            } catch (Exception e) {
                return "Lỗi hoàn tất: " + e.getMessage();
            }
        }
    }

    private void closeQuiet() {
        try { if (saveOut != null) saveOut.close(); } catch (Exception ignored) { }
        saveOut = null;
        if (saveUri != null) {
            try { getContentResolver().delete(saveUri, null, null); } catch (Exception ignored) { }
            saveUri = null;
        }
        saveFile = null;
    }
}
