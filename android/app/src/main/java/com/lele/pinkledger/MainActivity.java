package com.lele.pinkledger;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Offline Android host. No INTERNET permission; the JavaScript bridge is only for bundled content. */
public class MainActivity extends Activity {
    private static final int SAVE = 41, OPEN = 42;
    private WebView web;
    private ValueCallback<Uri[]> chooser;
    private String pendingExport;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(255,180,217));
        getWindow().setNavigationBarColor(Color.rgb(255,210,231));
        web = new WebView(this);
        setContentView(web);
        // Respect system bars with Android 15 edge-to-edge enforcement.
        web.setOnApplyWindowInsetsListener((view,insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
            return insets;
        });
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.getSettings().setAllowFileAccessFromFileURLs(false);
        web.getSettings().setAllowUniversalAccessFromFileURLs(false);
        web.addJavascriptInterface(new ExportBridge(),"AndroidLedger");
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest r) { return true; }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (chooser != null) chooser.onReceiveValue(null);
                chooser = callback;
                Intent pick = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("*/*");
                startActivityForResult(pick,OPEN);
                return true;
            }
        });
        web.loadUrl("file:///android_asset/index.html");
    }

    private class ExportBridge {
        @JavascriptInterface public void saveText(String name, String content, String mime) {
            if (content.length()>10000000) return;
            runOnUiThread(() -> {
                if (pendingExport != null) { Toast.makeText(MainActivity.this,"Finish the current export first.",Toast.LENGTH_SHORT).show(); return; }
                pendingExport=content;
                Intent save=new Intent(Intent.ACTION_CREATE_DOCUMENT);
                save.addCategory(Intent.CATEGORY_OPENABLE);
                save.setType(mime.equals("application/json")?mime:"text/csv");
                save.putExtra(Intent.EXTRA_TITLE,name.replaceAll("[^a-zA-Z0-9._-]","_"));
                startActivityForResult(save,SAVE);
            });
        }
    }

    @Override protected void onActivityResult(int code,int result,Intent data) {
        super.onActivityResult(code,result,data);
        if (code==OPEN && chooser!=null) {
            chooser.onReceiveValue(result==RESULT_OK && data!=null?new Uri[]{data.getData()}:null);
            chooser=null;
        }
        if (code==SAVE) {
            String content=pendingExport;pendingExport=null;
            if (result!=RESULT_OK || data==null || content==null) return;
            try(OutputStream stream=getContentResolver().openOutputStream(data.getData())) {
                if(stream==null) throw new java.io.IOException("No output stream");
                stream.write(content.getBytes(StandardCharsets.UTF_8));
                Toast.makeText(this,"Backup saved ♡",Toast.LENGTH_SHORT).show();
            } catch(Exception e) { Toast.makeText(this,"Could not save. Please try exporting again.",Toast.LENGTH_LONG).show(); }
        }
    }
    @Override public void onBackPressed() {
        web.evaluateJavascript("(function(){var d=document.querySelector('dialog');if(d&&d.open){d.close();return true;}return false;})()", result -> {
            if (!"true".equals(result)) finish();
        });
    }
    @Override public void onDestroy() {
        if(chooser!=null) chooser.onReceiveValue(null);
        web.removeJavascriptInterface("AndroidLedger");web.destroy();super.onDestroy();
    }
}
