package com.fridgeboard.app;

import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DeepLink")
public class DeepLinkPlugin extends Plugin {
    private static DeepLinkPlugin instance;
    private static String pendingUrl;
    private String initialUrl;

    @Override
    public void load() {
        instance = this;
        Intent intent = getActivity().getIntent();
        initialUrl = intent == null || intent.getData() == null ? null : intent.getDataString();
    }

    @PluginMethod
    public void getInitialUrl(PluginCall call) {
        String url = initialUrl != null ? initialUrl : pendingUrl;
        initialUrl = null;
        pendingUrl = null;
        JSObject result = new JSObject();
        result.put("url", url);
        call.resolve(result);
    }

    public static void receiveIntent(Intent intent) {
        if (intent == null || intent.getData() == null) return;
        String url = intent.getDataString();
        DeepLinkPlugin plugin = instance;
        if (plugin == null) {
            pendingUrl = url;
            return;
        }
        plugin.notifyUrl(url);
    }

    private void notifyUrl(String url) {
        JSObject event = new JSObject();
        event.put("url", url);
        notifyListeners("urlOpen", event);
    }
}
