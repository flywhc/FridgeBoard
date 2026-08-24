package com.fridgeboard.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

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

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "NativeCapabilities")
public class NativeCapabilitiesPlugin extends Plugin {
    private static final long MAX_APK_BYTES = 256L * 1024L * 1024L;
    private ConnectivityManager connectivityManager;
    private ConnectivityManager.NetworkCallback networkCallback;
    private OnBackPressedCallback backCallback;
    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();

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
        updateExecutor.shutdownNow();
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

    @PluginMethod
    public void getAppInfo(PluginCall call) {
        try {
            PackageInfo packageInfo = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            JSObject result = new JSObject();
            result.put("platform", "android");
            result.put("versionName", packageInfo.versionName == null ? "" : packageInfo.versionName);
            result.put("versionCode", Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                    ? packageInfo.getLongVersionCode() : packageInfo.versionCode);
            call.resolve(result);
        } catch (PackageManager.NameNotFoundException exception) {
            call.reject("无法读取应用版本", "APP_INFO_FAILED", exception);
        }
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            call.resolve();
            return;
        }
        Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
        );
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException exception) {
            call.reject("无法打开安装权限设置", "INSTALL_SETTINGS_UNAVAILABLE", exception);
        }
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String rawUrl = call.getString("url");
        String expectedSha256 = call.getString("sha256");
        String filename = call.getString("filename");
        Integer expectedFileSize = call.getInt("fileSize");
        if (!isAllowedUpdateUrl(rawUrl) || !isSha256(expectedSha256) || !isApkFilename(filename)
                || expectedFileSize == null || expectedFileSize <= 0 || expectedFileSize > MAX_APK_BYTES) {
            call.reject("更新安装包参数无效", "APK_UPDATE_INVALID_ARGUMENTS");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !getContext().getPackageManager().canRequestPackageInstalls()) {
            call.reject("请先允许本应用安装未知来源应用", "UNKNOWN_SOURCES_DISABLED");
            return;
        }
        updateExecutor.execute(() -> downloadAndLaunchInstaller(
                call, rawUrl, expectedSha256, filename, expectedFileSize.longValue()));
    }

    private void downloadAndLaunchInstaller(
            PluginCall call, String rawUrl, String expectedSha256, String filename, long expectedFileSize) {
        File updateDirectory = getContext().getExternalFilesDir("updates");
        File temporaryFile = null;
        try {
            if (updateDirectory == null && !getContext().getCacheDir().exists()) {
                throw new IOException("无法创建更新目录");
            }
            if (updateDirectory == null) updateDirectory = getContext().getCacheDir();
            if (!updateDirectory.exists() && !updateDirectory.mkdirs()) {
                throw new IOException("无法创建更新目录");
            }
            temporaryFile = File.createTempFile("fridgeboard-update-", ".apk", updateDirectory);
            HttpURLConnection connection = (HttpURLConnection) new URL(rawUrl).openConnection();
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(120_000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
            try {
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                    throw new IOException("下载服务返回 HTTP " + connection.getResponseCode());
                }
                long contentLength = connection.getContentLengthLong();
                if (contentLength <= 0 || contentLength != expectedFileSize || contentLength > MAX_APK_BYTES) {
                    throw new IOException("APK 文件大小不符合预期");
                }
                MessageDigest digest = MessageDigest.getInstance("SHA-256");
                long totalBytes = 0;
                try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                     BufferedOutputStream output = new BufferedOutputStream(new FileOutputStream(temporaryFile))) {
                    byte[] buffer = new byte[32 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        totalBytes += read;
                        if (totalBytes > expectedFileSize || totalBytes > MAX_APK_BYTES) {
                            throw new IOException("APK 文件超过大小限制");
                        }
                        digest.update(buffer, 0, read);
                        output.write(buffer, 0, read);
                    }
                }
                if (totalBytes != expectedFileSize) throw new IOException("APK 文件下载不完整");
                if (!toHex(digest.digest()).equalsIgnoreCase(expectedSha256)) {
                    throw new IOException("APK SHA-256 校验失败");
                }
            } finally {
                connection.disconnect();
            }

            File apkFile = new File(updateDirectory, sanitizeFilename(filename));
            if (apkFile.exists() && !apkFile.delete()) throw new IOException("无法替换旧安装包");
            if (!temporaryFile.renameTo(apkFile)) throw new IOException("无法保存安装包");
            temporaryFile = null;
            File finalApkFile = apkFile;
            getActivity().runOnUiThread(() -> {
                try {
                    Uri apkUri = FileProvider.getUriForFile(
                            getContext(), getContext().getPackageName() + ".fileprovider", finalApkFile);
                    Intent intent = new Intent(Intent.ACTION_INSTALL_PACKAGE);
                    intent.setDataAndType(apkUri, "application/vnd.android.package-archive");
                    intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    notifyListeners("apkUpdate", new JSObject().put("state", "installing"));
                    getActivity().startActivity(intent);
                    call.resolve();
                } catch (ActivityNotFoundException exception) {
                    call.reject("系统没有可用的 APK 安装器", "APK_INSTALLER_UNAVAILABLE", exception);
                } catch (Exception exception) {
                    call.reject("无法打开系统安装器", "APK_INSTALL_FAILED", exception);
                }
            });
        } catch (Exception exception) {
            if (temporaryFile != null) temporaryFile.delete();
            JSObject event = new JSObject();
            event.put("state", "download-failed");
            event.put("message", "下载或校验 APK 失败，请重试。");
            event.put("code", "APK_DOWNLOAD_FAILED");
            notifyListeners("apkUpdate", event);
            call.reject("下载或校验 APK 失败", "APK_DOWNLOAD_FAILED", exception);
        }
    }

    private static boolean isAllowedUpdateUrl(String rawUrl) {
        if (rawUrl == null) return false;
        try {
            Uri uri = Uri.parse(rawUrl);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && "app.flycn.fyi".equalsIgnoreCase(uri.getHost())
                    && uri.getPath() != null
                    && uri.getPath().startsWith("/download/");
        } catch (Exception exception) {
            return false;
        }
    }

    private static boolean isSha256(String value) {
        return value != null && value.matches("[0-9a-fA-F]{64}");
    }

    private static boolean isApkFilename(String value) {
        return value != null && value.length() <= 255 && value.toLowerCase(Locale.ROOT).endsWith(".apk")
                && !value.contains("/") && !value.contains("\\") && !value.contains("..");
    }

    private static String sanitizeFilename(String value) {
        return value.replaceAll("[^A-Za-z0-9._-]", "_");
    }

    private static String toHex(byte[] bytes) {
        StringBuilder result = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) result.append(String.format(Locale.ROOT, "%02x", value));
        return result.toString();
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
