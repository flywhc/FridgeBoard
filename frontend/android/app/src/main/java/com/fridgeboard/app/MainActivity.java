package com.fridgeboard.app;

import android.os.Build;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

import android.content.Intent;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SecureSessionPlugin.class);
        registerPlugin(DeepLinkPlugin.class);
        registerPlugin(NativeCapabilitiesPlugin.class);
        super.onCreate(savedInstanceState);
        if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.Q) {
            installAndroidTenWindowInsetsWorkaround();
        }
    }

    private void installAndroidTenWindowInsetsWorkaround() {
        View webViewParent = getBridge().getWebView().getParent() instanceof View
            ? (View) getBridge().getWebView().getParent()
            : null;
        if (webViewParent == null) return;

        ViewCompat.setOnApplyWindowInsetsListener(webViewParent, (view, insets) -> {
            // Android 10 applies the IME height twice: adjustResize changes the WebView
            // bounds, then Capacitor's SystemBars listener adds the same height as padding.
            view.setPadding(0, 0, 0, 0);
            return new WindowInsetsCompat.Builder(insets)
                .setInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout(), Insets.NONE)
                .build();
        });
        ViewCompat.requestApplyInsets(webViewParent);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        DeepLinkPlugin.receiveIntent(intent);
    }
}
