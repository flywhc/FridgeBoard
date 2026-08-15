package com.fridgeboard.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;

@CapacitorPlugin(name = "NativeCapabilities")
public class NativeCapabilitiesPlugin extends Plugin {
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private OnBackPressedCallback backCallback;

    @Override
    public void load() {
        connectivityManager = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
        backCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (hasListeners("backButton")) {
                    notifyListeners("backButton", new JSObject());
                    return;
                }
                setEnabled(false);
                getActivity().getOnBackPressedDispatcher().onBackPressed();
                setEnabled(true);
            }
        };
        getActivity().getOnBackPressedDispatcher().addCallback(backCallback);
        networkCallback = new ConnectivityManager.NetworkCallback() {
            @Override
            public void onAvailable(Network network) { notifyNetwork(true); }

            @Override
            public void onLost(Network network) { notifyNetwork(isConnected()); }
        };
        connectivityManager.registerDefaultNetworkCallback(networkCallback);
    }

    @Override
    protected void handleOnDestroy() {
        if (backCallback != null) {
            backCallback.remove();
            backCallback = null;
        }
        if (connectivityManager != null && networkCallback != null) {
            connectivityManager.unregisterNetworkCallback(networkCallback);
            networkCallback = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public void share(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("text/plain");
        String text = call.getString("text");
        String url = call.getString("url");
        if (text == null && url == null) {
            call.reject("text or url is required");
            return;
        }
        String sharedText = text == null ? url : url == null ? text : text + "\n" + url;
        intent.putExtra(Intent.EXTRA_TEXT, sharedText);
        String title = call.getString("title");
        startActivityForResult(call, Intent.createChooser(intent, title == null ? "分享" : title), "shareCompleted");
    }

    @PluginMethod
    public void openExternalUrl(PluginCall call) {
        String rawUrl = call.getString("url");
        Uri uri = rawUrl == null ? null : Uri.parse(rawUrl);
        if (uri == null || !"https".equalsIgnoreCase(uri.getScheme())) {
            call.reject("仅允许打开 HTTPS 地址");
            return;
        }
        String customTabsPackage = CustomTabsClient.getPackageName(getContext(), null);
        if (customTabsPackage != null) {
            CustomTabsIntent customTabs = new CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .build();
            customTabs.intent.setPackage(customTabsPackage);
            customTabs.launchUrl(getActivity(), uri);
            call.resolve();
            return;
        }
        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
        android.content.pm.ResolveInfo resolved = getContext().getPackageManager()
                .resolveActivity(intent, 0);
        if (resolved == null || resolved.activityInfo == null
                || resolved.activityInfo.name.contains("ResolverActivity")) {
            call.reject("未找到可用的系统浏览器");
            return;
        }
        intent.setPackage(resolved.activityInfo.packageName);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException exception) {
            call.reject("无法打开系统浏览器", exception);
        }
    }

    @ActivityCallback
    private void shareCompleted(PluginCall call, ActivityResult result) {
        if (result.getResultCode() == Activity.RESULT_OK) {
            call.resolve();
            return;
        }
        call.reject("分享已取消", "SHARE_CANCELLED");
    }

    @PluginMethod
    public void getNetworkStatus(PluginCall call) {
        JSObject result = new JSObject();
        result.put("connected", isConnected());
        call.resolve(result);
    }

    private boolean isConnected() {
        Network network = connectivityManager.getActiveNetwork();
        NetworkCapabilities capabilities = network == null ? null : connectivityManager.getNetworkCapabilities(network);
        return capabilities != null && capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET);
    }

    private void notifyNetwork(boolean connected) {
        JSObject result = new JSObject();
        result.put("connected", connected);
        notifyListeners("networkChange", result);
    }
}
