package com.fridgeboard.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.KeyStore;
import java.security.UnrecoverableKeyException;

import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/** Shared Android Keystore-backed storage used by Capacitor and widget workers. */
public final class SecureSessionStore {
    public static final String SESSION_KEY = "fridgeboard.mobile.session";
    public static final String DEVICE_TOKENS_KEY = "fridgeboard.mobile.device-tokens";
    public static final String ACTIVE_DEVICE_KEY = "fridgeboard.mobile.active-device";

    static final String KEY_ALIAS = "fridgeboard_secure_session_v1";
    static final String PREFS = "fridgeboard_secure_session";
    static final String CIPHERTEXT = "ciphertext";
    static final String IV = "iv";
    private static final String GENERATION_KEY = "fridgeboard.widget.account-generation";

    private final Context context;

    /** Creates a store scoped to the application's private storage. */
    public SecureSessionStore(Context context) {
        this.context = context.getApplicationContext();
    }

    /** Reads and decrypts a value, returning {@code null} when it is absent. */
    public synchronized String get(String key) throws Exception {
        requireKey(key);
        return decrypt(key);
    }

    /** Encrypts and durably stores a value. */
    public synchronized void set(String key, String value) throws Exception {
        requireKey(key);
        if (value == null) throw new IllegalArgumentException("value is required");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        boolean committed = preferences().edit()
                .putString(ciphertextKey(key), Base64.encodeToString(ciphertext, Base64.NO_WRAP))
                .putString(ivKey(key), Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
                .commit();
        if (!committed) throw new IllegalStateException("secure storage preferences commit failed");
    }

    /** Removes one encrypted value without affecting other sessions or credentials. */
    public synchronized void remove(String key) throws Exception {
        requireKey(key);
        boolean committed = preferences().edit()
                .remove(ciphertextKey(key)).remove(ivKey(key)).commit();
        if (!committed) throw new IllegalStateException("secure storage remove failed");
    }

    /** Explicitly destroys the Keystore key and all encrypted values. */
    public synchronized void reset() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        if (keyStore.containsAlias(KEY_ALIAS)) keyStore.deleteEntry(KEY_ALIAS);
        if (!preferences().edit().clear().commit()) {
            throw new IllegalStateException("secure storage reset failed");
        }
    }

    /** Returns the account generation used to isolate widget snapshots. */
    public synchronized long getAccountGeneration() {
        return preferences().getLong(GENERATION_KEY, 0L);
    }

    /** Advances the snapshot namespace after an explicit account switch or reset. */
    public synchronized long advanceAccountGeneration() {
        long generation = getAccountGeneration() + 1L;
        if (!preferences().edit().putLong(GENERATION_KEY, generation).commit()) {
            throw new IllegalStateException("account generation update failed");
        }
        return generation;
    }

    Context appContext() {
        return context;
    }

    private SharedPreferences preferences() {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void requireKey(String key) {
        if (key == null || key.isEmpty()) throw new IllegalArgumentException("key is required");
    }

    private static String ciphertextKey(String key) {
        return key + "." + CIPHERTEXT;
    }

    private static String ivKey(String key) {
        return key + "." + IV;
    }

    private String decrypt(String key) throws Exception {
        String encodedCiphertext = preferences().getString(ciphertextKey(key), null);
        String encodedIv = preferences().getString(ivKey(key), null);
        if (encodedCiphertext == null || encodedIv == null) return null;
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(
                128, Base64.decode(encodedIv, Base64.NO_WRAP)));
        return new String(cipher.doFinal(Base64.decode(encodedCiphertext, Base64.NO_WRAP)),
                StandardCharsets.UTF_8);
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
        KeyGenerator generator = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setUserAuthenticationRequired(false)
                .build());
        return generator.generateKey();
    }

    /** Returns whether an exception indicates a device/Keystore mismatch. */
    static boolean isRecoverableKeyFailure(Exception exception) {
        return exception instanceof KeyPermanentlyInvalidatedException
                || exception instanceof UnrecoverableKeyException
                || exception instanceof InvalidKeyException
                || exception instanceof AEADBadTagException;
    }
}
