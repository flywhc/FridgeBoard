package com.fridgeboard.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import android.content.Context;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private SecureSessionStore store() {
        return new SecureSessionStore(getBridge().getContext());
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("key is required");
            return;
        }
        try {
            String value = store().get(key);
            JSObject result = new JSObject();
            result.put("value", value);
            call.resolve(result);
        } catch (Exception exception) {
            String code = SecureSessionStore.isRecoverableKeyFailure(exception)
                    ? "SECURE_STORAGE_KEY_MISMATCH"
                    : "SECURE_STORAGE_READ_FAILED";
            call.reject("secure storage read failed", code, exception);
        }
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.isEmpty() || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            store().set(key, value);
            call.resolve();
        } catch (Exception exception) {
            String code = SecureSessionStore.isRecoverableKeyFailure(exception)
                    ? "SECURE_STORAGE_KEY_MISMATCH"
                    : "SECURE_STORAGE_WRITE_FAILED";
            call.reject("secure storage write failed", code, exception);
        }
    }

    @PluginMethod
    public void reset(PluginCall call) {
        try {
            resetStorage(getBridge().getContext());
            call.resolve();
        } catch (Exception exception) {
            call.reject("secure storage reset failed", "SECURE_STORAGE_RESET_FAILED", exception);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("key is required");
            return;
        }
        try {
            store().remove(key);
            call.resolve();
        } catch (Exception exception) {
            call.reject("secure storage remove failed", "SECURE_STORAGE_REMOVE_FAILED", exception);
        }
    }

    private void resetStorage(Context context) throws Exception {
        new SecureSessionStore(context).reset();
    }
}
