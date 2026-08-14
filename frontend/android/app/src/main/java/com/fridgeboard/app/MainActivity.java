package com.fridgeboard.app;

import com.getcapacitor.BridgeActivity;

import android.content.Intent;

public class MainActivity extends BridgeActivity {
    @Override
    protected void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(SecureSessionPlugin.class);
        registerPlugin(DeepLinkPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        DeepLinkPlugin.receiveIntent(intent);
    }
}
