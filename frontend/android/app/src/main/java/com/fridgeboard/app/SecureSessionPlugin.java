package com.fridgeboard.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.KeyStore;
import java.security.UnrecoverableKeyException;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

@CapacitorPlugin(name = "SecureSession")
public class SecureSessionPlugin extends Plugin {
    private static final String KEY_ALIAS = "fridgeboard_secure_session_v1";
    private static final String PREFS = "fridgeboard_secure_session";
    private static final String CIPHERTEXT = "ciphertext";
    private static final String IV = "iv";

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("key is required");
            return;
        }
        try {
            String value = decrypt(getBridge().getContext(), key);
            JSObject result = new JSObject();
            result.put("value", value);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("secure storage read failed", exception);
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
            encrypt(getBridge().getContext(), key, value);
            call.resolve();
        } catch (Exception exception) {
            if (!isRecoverableKeyFailure(exception)) {
                call.reject("secure storage write failed", exception);
                return;
            }
            try {
                resetStorage(getBridge().getContext());
                encrypt(getBridge().getContext(), key, value);
                call.resolve();
            } catch (Exception retryException) {
                call.reject("secure storage write failed", retryException);
            }
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null || key.isEmpty()) {
            call.reject("key is required");
            return;
        }
        getBridge().getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().remove(key + "." + CIPHERTEXT).remove(key + "." + IV).apply();
        call.resolve();
    }

    private static SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) {
            KeyStore.Entry entry = keyStore.getEntry(KEY_ALIAS, null);
            if (entry instanceof KeyStore.SecretKeyEntry) {
                return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
            }
            keyStore.deleteEntry(KEY_ALIAS);
        }
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
        ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build());
        return generator.generateKey();
    }

    private static void encrypt(Context context, String key, String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        boolean committed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putString(key + "." + CIPHERTEXT, Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(key + "." + IV, Base64.encodeToString(iv, Base64.NO_WRAP))
                .commit();
        if (!committed) throw new IllegalStateException("secure storage preferences commit failed");
    }

    private static String decrypt(Context context, String key) throws Exception {
        SharedPreferences preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String encodedCiphertext = preferences.getString(key + "." + CIPHERTEXT, null);
        String encodedIv = preferences.getString(key + "." + IV, null);
        if (encodedCiphertext == null || encodedIv == null) return null;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(128, Base64.decode(encodedIv, Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(encodedCiphertext, Base64.NO_WRAP)), StandardCharsets.UTF_8);
    }

    private static boolean isRecoverableKeyFailure(Exception exception) {
        return exception instanceof KeyPermanentlyInvalidatedException
                || exception instanceof UnrecoverableKeyException
                || exception instanceof InvalidKeyException;
    }

    private static void resetStorage(Context context) throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
        boolean committed = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .edit().clear().commit();
        if (!committed) throw new IllegalStateException("secure storage reset failed");
    }
}
