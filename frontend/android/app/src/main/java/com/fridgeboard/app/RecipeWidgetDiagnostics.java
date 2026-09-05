package com.fridgeboard.app;

import android.content.Context;
import android.util.Log;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.PrintWriter;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Date;
import java.util.Locale;

/** Writes bounded, credential-free widget diagnostics to app-private daily files. */
final class RecipeWidgetDiagnostics {
    private static final String TAG = "RecipeWidgetHttp";
    private static final int RETAINED_FILES = 7;
    private static final int MAX_STACK_CHARS = 12_000;
    private static final Object FILE_LOCK = new Object();
    private final File directory;

    RecipeWidgetDiagnostics(Context context) {
        directory = new File(context.getFilesDir(), "recipe_widget_logs");
    }

    void httpFailure(String method, String path, int status, long elapsedMs,
                     String contentType, String response, Exception exception) {
        try {
            JSONObject record = new JSONObject()
                    .put("timestamp", System.currentTimeMillis())
                    .put("service", "fridgeboard-api")
                    .put("operation", "recipe-widget-http")
                    .put("method", method)
                    .put("path", path)
                    .put("status", status)
                    .put("elapsedMs", elapsedMs)
                    .put("contentType", contentType == null ? JSONObject.NULL : contentType)
                    .put("responseLength", response == null ? 0 : response.length())
                    .put("responseSummary", responseSummary(response));
            if (exception != null) {
                record.put("exceptionType", exception.getClass().getName());
                record.put("stack", stackTrace(exception));
            }
            append(record.toString());
        } catch (JSONException | IOException failure) {
            Log.e(TAG, "unable to persist widget HTTP diagnostics", failure);
        }
    }

    private void append(String line) throws IOException {
        synchronized (FILE_LOCK) {
            if (!directory.exists() && !directory.mkdirs()) {
                throw new IOException("widget log directory could not be created");
            }
            File target = new File(directory, "widget-" + new SimpleDateFormat(
                    "yyyy-MM-dd", Locale.US).format(new Date()) + ".log");
            try (FileOutputStream output = new FileOutputStream(target, true)) {
                output.write((line + "\n").getBytes(StandardCharsets.UTF_8));
            }
            prune();
        }
    }

    private void prune() {
        File[] files = directory.listFiles((dir, name) -> name.startsWith("widget-")
                && name.endsWith(".log"));
        if (files == null || files.length <= RETAINED_FILES) return;
        Arrays.sort(files, (left, right) -> left.getName().compareTo(right.getName()));
        for (int index = 0; index < files.length - RETAINED_FILES; index++) {
            if (!files[index].delete()) Log.w(TAG, "unable to prune old widget diagnostic log");
        }
    }

    private static String responseSummary(String response) {
        if (response == null || response.isEmpty()) return "empty";
        String trimmed = response.trim();
        if (trimmed.startsWith("{")) return "json-object";
        if (trimmed.startsWith("[")) return "json-array";
        return "non-json";
    }

    private static String stackTrace(Exception exception) {
        StringWriter buffer = new StringWriter();
        exception.printStackTrace(new PrintWriter(buffer));
        String stack = buffer.toString();
        return stack.length() <= MAX_STACK_CHARS ? stack : stack.substring(0, MAX_STACK_CHARS);
    }
}
