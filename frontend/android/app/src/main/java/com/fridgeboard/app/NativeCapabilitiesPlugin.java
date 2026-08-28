package com.fridgeboard.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.content.pm.PackageInfo;
import android.content.pm.PackageInstaller;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.content.FileProvider;

import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResult;
import androidx.browser.customtabs.CustomTabsClient;
import androidx.browser.customtabs.CustomTabsIntent;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;

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
    private static final long MAX_ICON_BYTES = 10L * 1024L * 1024L;
    private static final long MAX_ICON_PIXELS = 16_000_000L;
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
    protected void handleOnResume() {
        super.handleOnResume();
        if (hasListeners("appResume")) notifyListeners("appResume", new JSObject());
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
    public void pickImage(PluginCall call) {
        String source = call.getString("source", "photo");
        Intent intent;
        if ("photo".equals(source)) {
            if (Build.VERSION.SDK_INT >= 33) {
                intent = new Intent("android.provider.action.PICK_IMAGES");
                intent.setType("image/*");
            } else {
                intent = new Intent(Intent.ACTION_PICK, MediaStore.Images.Media.EXTERNAL_CONTENT_URI);
                intent.setType("image/*");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            }
        } else {
            intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
            intent.setType("image/*");
            intent.addCategory(Intent.CATEGORY_OPENABLE);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        }
        startActivityForResult(call, intent, "pickImageResult");
    }

    @ActivityCallback
    private void pickImageResult(PluginCall call, ActivityResult result) {
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null
                || result.getData().getData() == null) {
            call.reject("已取消图片选择", "IMAGE_PICK_CANCELLED");
            return;
        }
        Uri uri = result.getData().getData();
        updateExecutor.execute(() -> readPickedImage(call, uri));
    }

    /** Reads picker content away from the UI thread and resolves the JS promise on it. */
    private void readPickedImage(PluginCall call, Uri uri) {
        try (java.io.InputStream input = getContext().getContentResolver().openInputStream(uri)) {
            if (input == null) throw new IOException("无法读取图片");
            java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
                if (output.size() > MAX_ICON_BYTES) throw new IOException("图片超过 10MB 限制");
            }
            byte[] bytes = output.toByteArray();
            if (bytes.length > MAX_ICON_BYTES) throw new IOException("图片超过 10MB 限制");
            String mediaType = getContext().getContentResolver().getType(uri);
            if ("image/heic".equalsIgnoreCase(mediaType) || "image/heif".equalsIgnoreCase(mediaType)) {
                BitmapFactory.Options bounds = new BitmapFactory.Options();
                bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                long pixels = (long) bounds.outWidth * bounds.outHeight;
                if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || pixels > MAX_ICON_PIXELS) {
                    throw new IOException("HEIC/HEIF 图片超过 16MP 限制");
                }
                Bitmap decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
                if (decoded == null) throw new IOException("HEIC/HEIF 无法转换为 PNG");
                java.io.ByteArrayOutputStream converted = new java.io.ByteArrayOutputStream();
                if (!decoded.compress(Bitmap.CompressFormat.PNG, 100, converted)) {
                    decoded.recycle();
                    throw new IOException("HEIC/HEIF 无法转换为 PNG");
                }
                decoded.recycle();
                bytes = converted.toByteArray();
                if (bytes.length > MAX_ICON_BYTES) throw new IOException("转换后的 PNG 超过 10MB 限制");
                mediaType = "image/png";
            }
            if (mediaType == null || !java.util.Arrays.asList("image/png", "image/jpeg", "image/webp").contains(mediaType.toLowerCase(Locale.ROOT))) {
                throw new IOException("文件不是受支持的图片");
            }
            final byte[] resultBytes = bytes;
            final String resultMediaType = mediaType;
            getBridge().executeOnMainThread(() -> call.resolve(new JSObject()
                    .put("data", "data:" + resultMediaType + ";base64," + Base64.encodeToString(resultBytes, Base64.NO_WRAP))
                    .put("mediaType", resultMediaType)
                    .put("name", uri.getLastPathSegment())));
        } catch (IOException exception) {
            getBridge().executeOnMainThread(() -> call.reject("无法读取图片，请改用页面文件选择器", "IMAGE_READ_FAILED", exception));
        }
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
    public void canInstallUnknownApps(PluginCall call) {
        call.resolve(new JSObject().put("allowed", hasUnknownSourcesPermission()));
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
    public void setSystemBars(PluginCall call) {
        String colorValue = call.getString("color");
        String style = call.getString("style", "LIGHT");
        if (colorValue == null || !colorValue.matches("#[0-9A-Fa-f]{6}")) {
            call.reject("系统栏颜色无效", "SYSTEM_BARS_INVALID_COLOR");
            return;
        }
        if (!"LIGHT".equals(style) && !"DARK".equals(style)) {
            call.reject("系统栏样式无效", "SYSTEM_BARS_INVALID_STYLE");
            return;
        }

        int color = Color.parseColor(colorValue);
        getBridge().executeOnMainThread(() -> {
            android.view.Window window = getActivity().getWindow();
            window.setStatusBarColor(color);
            window.setNavigationBarColor(color);
            window.getDecorView().setBackgroundColor(color);
            getBridge().getWebView().setBackgroundColor(color);
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
            boolean lightContent = "LIGHT".equals(style);
            controller.setAppearanceLightStatusBars(lightContent);
            controller.setAppearanceLightNavigationBars(lightContent);
            call.resolve();
        });
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
        if (!hasUnknownSourcesPermission()) {
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
            HttpURLConnection connection = openDownloadConnection(rawUrl);
            try {
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
                    intent.putExtra(Intent.EXTRA_RETURN_RESULT, true);
                    notifyListeners("apkUpdate", new JSObject().put("state", "installing"));
                    startActivityForResult(call, intent, "apkInstallCompleted");
                } catch (ActivityNotFoundException exception) {
                    notifyInstallFailed("系统没有可用的 APK 安装器", "APK_INSTALLER_UNAVAILABLE");
                    call.reject("系统没有可用的 APK 安装器", "APK_INSTALLER_UNAVAILABLE", exception);
                } catch (Exception exception) {
                    notifyInstallFailed("无法打开系统安装器", "APK_INSTALL_FAILED");
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
                    && "github.com".equalsIgnoreCase(uri.getHost())
                    && uri.getPath() != null
                    && uri.getPath().startsWith("/flywhc/FridgeBoard/releases/download/");
        } catch (Exception exception) {
            return false;
        }
    }

    private boolean hasUnknownSourcesPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
    }

    private static HttpURLConnection openDownloadConnection(String rawUrl) throws IOException {
        URL currentUrl = new URL(rawUrl);
        for (int redirect = 0; redirect <= 5; redirect++) {
            if (!isAllowedDownloadHost(currentUrl, redirect > 0)) {
                throw new IOException("APK 下载地址不在 GitHub FridgeBoard Release 范围内");
            }
            HttpURLConnection connection = (HttpURLConnection) currentUrl.openConnection();
            connection.setConnectTimeout(15_000);
            connection.setReadTimeout(120_000);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive, application/octet-stream");
            int responseCode = connection.getResponseCode();
            if (responseCode == HttpURLConnection.HTTP_OK) return connection;
            if (responseCode >= 300 && responseCode < 400) {
                String location = connection.getHeaderField("Location");
                connection.disconnect();
                if (location == null) throw new IOException("APK 下载重定向缺少目标地址");
                currentUrl = new URL(currentUrl, location);
                continue;
            }
            connection.disconnect();
            throw new IOException("下载服务返回 HTTP " + responseCode);
        }
        throw new IOException("APK 下载重定向次数过多");
    }

    private static boolean isAllowedDownloadHost(URL url, boolean redirect) {
        if (!"https".equalsIgnoreCase(url.getProtocol())) return false;
        if (!redirect) {
            return "github.com".equalsIgnoreCase(url.getHost())
                    && url.getPath() != null
                    && url.getPath().startsWith("/flywhc/FridgeBoard/releases/download/");
        }
        return "release-assets.githubusercontent.com".equalsIgnoreCase(url.getHost())
                || "objects.githubusercontent.com".equalsIgnoreCase(url.getHost());
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

    private void notifyInstallFailed(String message, String code) {
        notifyListeners("apkUpdate", new JSObject()
                .put("state", "install-failed")
                .put("message", message)
                .put("code", code));
    }

    private static String installFailureCode(int status) {
        switch (status) {
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE:
                return "APK_INSTALL_SIGNATURE_MISMATCH";
            case PackageInstaller.STATUS_FAILURE_BLOCKED:
                return "APK_INSTALL_BLOCKED";
            case PackageInstaller.STATUS_FAILURE_STORAGE:
                return "APK_INSTALL_STORAGE";
            case PackageInstaller.STATUS_FAILURE_INVALID:
                return "APK_INSTALL_INVALID";
            case PackageInstaller.STATUS_FAILURE_ABORTED:
                return "APK_INSTALL_CANCELLED";
            default:
                return "APK_INSTALL_FAILED";
        }
    }

    private static String installFailureMessage(int status, String statusMessage) {
        switch (status) {
            case PackageInstaller.STATUS_FAILURE_INCOMPATIBLE:
                return "安装失败：当前应用与更新包签名不一致，请卸载当前版本后重新安装。";
            case PackageInstaller.STATUS_FAILURE_BLOCKED:
                return "安装失败：系统阻止了安装，请允许本应用安装未知来源应用。";
            case PackageInstaller.STATUS_FAILURE_STORAGE:
                return "安装失败：设备存储空间不足，请清理空间后重试。";
            case PackageInstaller.STATUS_FAILURE_INVALID:
                return "安装失败：安装包无效或已损坏，请重新下载。";
            case PackageInstaller.STATUS_FAILURE_ABORTED:
                return "安装已取消。";
            default:
                if (statusMessage != null && !statusMessage.trim().isEmpty()) {
                    return "安装失败：" + statusMessage.trim();
                }
                return "安装失败，请重试。";
        }
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

    @ActivityCallback
    private void apkInstallCompleted(PluginCall call, ActivityResult result) {
        Intent data = result.getData();
        int status = data == null
                ? (result.getResultCode() == Activity.RESULT_OK
                        ? PackageInstaller.STATUS_SUCCESS : PackageInstaller.STATUS_FAILURE_ABORTED)
                : data.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE);
        if (result.getResultCode() == Activity.RESULT_OK || status == PackageInstaller.STATUS_SUCCESS) {
            notifyListeners("apkUpdate", new JSObject().put("state", "installed"));
            call.resolve();
            return;
        }
        String statusMessage = data == null
                ? null : data.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE);
        String code = installFailureCode(status);
        String message = installFailureMessage(status, statusMessage);
        notifyInstallFailed(message, code);
        call.reject(message, code);
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
