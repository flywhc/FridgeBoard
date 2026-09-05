package com.fridgeboard.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONException;
import org.json.JSONArray;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** Private, token-free persistence for widget bindings, summaries, and recipe snapshots. */
public final class RecipeWidgetRepository {
    static final String PREFS = "fridgeboard_recipe_widgets";
    private static final String CONFIG_PREFIX = "config.";
    private static final String STATE_PREFIX = "state.";
    private static final String SUMMARY_PREFIX = "summary.";
    private static final String SNAPSHOT_PREFIX = "snapshot.";

    private final SharedPreferences preferences;
    private final SecureSessionStore sessionStore;

    /** Creates a repository scoped to the application's private storage. */
    public RecipeWidgetRepository(Context context) {
        Context appContext = context.getApplicationContext();
        preferences = appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sessionStore = new SecureSessionStore(appContext);
    }

    /** Immutable widget binding returned to configuration and rendering code. */
    public static final class WidgetBinding {
        public final int widgetId;
        public final String fridgeId;
        public final String accessRole;
        public final int pageIndex;

        WidgetBinding(int widgetId, String fridgeId, String accessRole, int pageIndex) {
            this.widgetId = widgetId;
            this.fridgeId = fridgeId;
            this.accessRole = accessRole;
            this.pageIndex = Math.max(0, pageIndex);
        }
    }

    /** Returns the binding for one AppWidget id, or {@code null} when it is unconfigured. */
    public synchronized WidgetBinding getWidgetBinding(int widgetId) {
        String raw = preferences.getString(configKey(widgetId), null);
        if (raw == null) return null;
        try {
            JSONObject object = new JSONObject(raw);
            String fridgeId = object.optString("fridgeId", "");
            String accessRole = object.optString("accessRole", "");
            if (fridgeId.isEmpty() || !("owner".equals(accessRole)
                    || "daily_access".equals(accessRole))) return null;
            return new WidgetBinding(widgetId, fridgeId, accessRole,
                    object.optInt("pageIndex", 0));
        } catch (JSONException ignored) {
            return null;
        }
    }

    /** Returns the strongly typed model used by the native rendering layer. */
    public synchronized RecipeWidgetModels.WidgetConfig getWidgetConfig(int widgetId) {
        WidgetBinding binding = getWidgetBinding(widgetId);
        return binding == null ? null : new RecipeWidgetModels.WidgetConfig(
                binding.widgetId, binding.fridgeId, binding.accessRole, binding.pageIndex);
    }

    /** Stores a strongly typed widget binding. */
    public void putWidgetConfig(RecipeWidgetModels.WidgetConfig config) {
        if (config == null) throw new IllegalArgumentException("config is required");
        putWidgetBinding(config.getWidgetId(), config.getFridgeId(), config.getAccessRole(),
                config.getPageIndex());
    }

    /** Alias used by configuration activities when persisting a selected refrigerator. */
    public void saveWidgetConfig(RecipeWidgetModels.WidgetConfig config) {
        putWidgetConfig(config);
    }

    /** Alias for callers that prefer read/save naming. */
    public RecipeWidgetModels.WidgetConfig readWidgetConfig(int widgetId) {
        return getWidgetConfig(widgetId);
    }

    /** Stores only non-secret widget binding state. */
    public synchronized void putWidgetBinding(
            int widgetId, String fridgeId, String accessRole, int pageIndex) {
        if (fridgeId == null || fridgeId.trim().isEmpty()) throw new IllegalArgumentException("fridgeId is required");
        if (!("owner".equals(accessRole) || "daily_access".equals(accessRole))) {
            throw new IllegalArgumentException("accessRole is invalid");
        }
        JSONObject object = new JSONObject();
        try {
            object.put("widgetId", widgetId);
            object.put("fridgeId", fridgeId);
            object.put("accessRole", accessRole);
            object.put("pageIndex", Math.max(0, pageIndex));
        } catch (JSONException impossible) {
            throw new IllegalStateException("widget binding encoding failed", impossible);
        }
        commit(preferences.edit().putString(configKey(widgetId), object.toString()),
                "widget binding write failed");
    }

    /** Updates only the persisted page index for an existing widget binding. */
    public synchronized void setPageIndex(int widgetId, int pageIndex) {
        WidgetBinding binding = getWidgetBinding(widgetId);
        if (binding == null) return;
        putWidgetBinding(widgetId, binding.fridgeId, binding.accessRole, pageIndex);
    }

    /** Removes one widget binding while retaining reusable refrigerator data. */
    public synchronized void removeWidget(int widgetId) {
        commit(preferences.edit().remove(configKey(widgetId)).remove(stateKey(widgetId)),
                "widget binding removal failed");
    }

    /** Returns the last non-sensitive rendering state for an instance. */
    public synchronized String getWidgetState(int widgetId) {
        return preferences.getString(stateKey(widgetId), "idle");
    }

    /** Stores a rendering state so a process restart can restore transient feedback. */
    public synchronized void setWidgetState(int widgetId, String state) {
        if (!"idle".equals(state) && !"loading".equals(state) && !"processing".equals(state)
                && !"failed".equals(state) && !"offline".equals(state)
                && !"auth_expired".equals(state)) {
            throw new IllegalArgumentException("widget state is invalid");
        }
        commit(preferences.edit().putString(stateKey(widgetId), state), "widget state write failed");
    }

    /** Clears the persisted rendering state and returns the instance to idle. */
    public synchronized void clearWidgetState(int widgetId) {
        commit(preferences.edit().remove(stateKey(widgetId)), "widget state removal failed");
    }

    /** Returns a cached refrigerator summary JSON object, or {@code null}. */
    public synchronized JSONObject getFridgeSummary(String fridgeId) {
        String raw = preferences.getString(summaryKey(fridgeId), null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException ignored) {
            return null;
        }
    }

    /** Atomically stores a refrigerator summary without credentials. */
    public synchronized void putFridgeSummary(String fridgeId, JSONObject summary) {
        requireId(fridgeId, "fridgeId");
        if (summary == null) throw new IllegalArgumentException("summary is required");
        commit(preferences.edit().putString(summaryKey(fridgeId), safeSummary(fridgeId, summary).toString()),
                "fridge summary write failed");
    }

    private static JSONObject safeSummary(String fridgeId, JSONObject source) {
        JSONObject result = new JSONObject();
        String[] fields = {
                "id", "name", "revision", "template_key", "template_name", "inventory_quantity",
                "setup_status", "display_device_status", "access_role", "accessRole",
                "templateKey", "templateName", "inventoryQuantity", "setupStatus",
                "displayDeviceStatus"
        };
        try {
            result.put("id", fridgeId);
            for (String field : fields) {
                if (!"id".equals(field) && source.has(field)) result.put(field, source.opt(field));
            }
            return result;
        } catch (JSONException exception) {
            throw new IllegalArgumentException("summary encoding failed", exception);
        }
    }

    /** Stores the model form of a refrigerator summary. */
    public void putFridgeSummary(RecipeWidgetModels.FridgeSummary summary) {
        if (summary == null) throw new IllegalArgumentException("summary is required");
        try {
            putFridgeSummary(summary.getId(), new JSONObject(summary.toJson()));
        } catch (JSONException exception) {
            throw new IllegalArgumentException("summary encoding failed", exception);
        }
    }

    /** Returns all cached summaries as a defensive JSON array. */
    public synchronized JSONArray getFridgeSummaries() {
        JSONArray result = new JSONArray();
        for (String key : preferences.getAll().keySet()) {
            if (!key.startsWith(SUMMARY_PREFIX)) continue;
            String raw = preferences.getString(key, null);
            if (raw == null) continue;
            try { result.put(new JSONObject(raw)); } catch (JSONException ignored) { /* skip corrupt entry */ }
        }
        return result;
    }

    /** Publishes the bounded summary list from the Capacitor bridge. */
    public synchronized void saveFridgeSummaries(JSONArray summaries) {
        if (summaries == null) throw new IllegalArgumentException("summaries are required");
        try {
            for (int index = 0; index < summaries.length(); index++) {
                JSONObject source = summaries.optJSONObject(index);
                if (source == null) throw new IllegalArgumentException("summary must be an object");
                String id = source.optString("id", "");
                if (id.isEmpty()) throw new IllegalArgumentException("summary id is required");
                JSONObject normalized = new JSONObject(source.toString());
                if (normalized.has("access_role") && !normalized.has("accessRole")) {
                    normalized.put("accessRole", normalized.opt("access_role"));
                }
                putFridgeSummary(id, normalized);
            }
        } catch (JSONException exception) {
            throw new IllegalArgumentException("summary JSON is invalid", exception);
        }
    }

    /** Returns cached summaries as validated model objects. */
    public synchronized List<RecipeWidgetModels.FridgeSummary> listFridgeSummaries() {
        List<RecipeWidgetModels.FridgeSummary> result = new ArrayList<>();
        JSONArray summaries = getFridgeSummaries();
        for (int index = 0; index < summaries.length(); index++) {
            JSONObject summary = summaries.optJSONObject(index);
            if (summary == null) continue;
            try {
                String role = summary.optString("accessRole",
                        summary.optString("access_role", "owner"));
                result.add(new RecipeWidgetModels.FridgeSummary(
                        summary.optString("id", ""), summary.optString("name", ""), role));
            } catch (IllegalArgumentException ignored) {
                // Corrupt cache entries are ignored; the next bridge publish repairs them.
            }
        }
        return Collections.unmodifiableList(result);
    }

    /** Replaces the published summary set and removes summaries no longer accessible. */
    public synchronized void replaceFridgeSummaries(
            List<RecipeWidgetModels.FridgeSummary> summaries) {
        if (summaries == null) throw new IllegalArgumentException("summaries are required");
        java.util.HashSet<String> retained = new java.util.HashSet<>();
        SharedPreferences.Editor editor = preferences.edit();
        for (RecipeWidgetModels.FridgeSummary summary : summaries) {
            if (summary == null) throw new IllegalArgumentException("summary is required");
            retained.add(summary.getId());
            try {
                editor.putString(summaryKey(summary.getId()), safeSummary(summary.getId(),
                        new JSONObject(summary.toJson())).toString());
            } catch (JSONException exception) {
                throw new IllegalArgumentException("summary encoding failed", exception);
            }
        }
        for (String key : preferences.getAll().keySet()) {
            if (!key.startsWith(SUMMARY_PREFIX)) continue;
            String raw = preferences.getString(key, null);
            if (raw == null) continue;
            try {
                if (!retained.contains(new JSONObject(raw).optString("id", ""))) editor.remove(key);
            } catch (JSONException ignored) { editor.remove(key); }
        }
        // Config keys intentionally are not part of this editor and survive replacement.
        commit(editor, "fridge summary replacement failed");
    }

    /** JSON bridge overload; converts and atomically replaces the same model list. */
    public synchronized void replaceFridgeSummaries(JSONArray summaries) {
        if (summaries == null) throw new IllegalArgumentException("summaries are required");
        List<RecipeWidgetModels.FridgeSummary> models = new ArrayList<>();
        for (int index = 0; index < summaries.length(); index++) {
            JSONObject value = summaries.optJSONObject(index);
            if (value == null) throw new IllegalArgumentException("summary must be an object");
            String role = value.optString("accessRole", value.optString("access_role", "owner"));
            models.add(new RecipeWidgetModels.FridgeSummary(value.optString("id", ""),
                    value.optString("name", ""), role));
        }
        replaceFridgeSummaries(models);
    }

    /** Reads a raw recipe snapshot from an account/fridge/week namespace. */
    public synchronized String getSnapshotJson(long accountGeneration, String fridgeId, String weekStart) {
        requireSnapshotPart(fridgeId, weekStart);
        return preferences.getString(snapshotKey(accountGeneration, fridgeId, weekStart), null);
    }

    /** Returns a parsed recipe snapshot, or {@code null} for a missing/corrupt snapshot. */
    public synchronized JSONObject getSnapshot(long accountGeneration, String fridgeId, String weekStart) {
        String raw = getSnapshotJson(accountGeneration, fridgeId, weekStart);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException ignored) {
            return null;
        }
    }

    /** Atomically replaces one recipe snapshot in its account/fridge/week namespace. */
    public synchronized void putSnapshotJson(
            long accountGeneration, String fridgeId, String weekStart, String snapshotJson) {
        requireSnapshotPart(fridgeId, weekStart);
        if (snapshotJson == null || snapshotJson.trim().isEmpty()) {
            throw new IllegalArgumentException("snapshotJson is required");
        }
        try {
            new JSONObject(snapshotJson);
        } catch (JSONException exception) {
            throw new IllegalArgumentException("snapshotJson must be an object", exception);
        }
        commit(preferences.edit().putString(
                snapshotKey(accountGeneration, fridgeId, weekStart), snapshotJson),
                "recipe snapshot write failed");
    }

    /** Atomically stores a parsed recipe snapshot in its account/fridge/week namespace. */
    public synchronized void putSnapshot(
            long accountGeneration, String fridgeId, String weekStart, JSONObject snapshot) {
        if (snapshot == null) throw new IllegalArgumentException("snapshot is required");
        putSnapshotJson(accountGeneration, fridgeId, weekStart, snapshot.toString());
    }

    /** Stores the strongly typed snapshot representation used by the renderer. */
    public void putSnapshot(RecipeWidgetModels.Snapshot snapshot) {
        if (snapshot == null) throw new IllegalArgumentException("snapshot is required");
        try {
            putSnapshot(snapshot.getAccountGeneration(), snapshot.getFridgeId(), snapshot.getWeekStart(),
                    new JSONObject(snapshot.toJson()));
        } catch (JSONException exception) {
            throw new IllegalArgumentException("snapshot encoding failed", exception);
        }
    }

    /** Alias for callers that prefer read/save naming. */
    public RecipeWidgetModels.Snapshot readSnapshot(long accountGeneration, String fridgeId,
                                                    String weekStart) {
        return getSnapshotModel(accountGeneration, fridgeId, weekStart);
    }

    /** Reads a strongly typed snapshot for native rendering code. */
    public synchronized RecipeWidgetModels.Snapshot getSnapshotModel(
            long accountGeneration, String fridgeId, String weekStart) {
        String raw = getSnapshotJson(accountGeneration, fridgeId, weekStart);
        if (raw == null) return null;
        try {
            JSONObject envelope = new JSONObject(raw);
            if (envelope.has("snapshots") || envelope.has("days")) {
                raw = normalizeSnapshotForModel(raw, accountGeneration, fridgeId, weekStart);
            }
            return RecipeWidgetModels.Snapshot.fromJson(raw);
        } catch (JSONException | IllegalArgumentException ignored) {
            try {
                return RecipeWidgetModels.Snapshot.fromJson(normalizeSnapshotForModel(raw,
                        accountGeneration, fridgeId, weekStart));
            } catch (RuntimeException invalidSnapshot) {
                return null;
            }
        }
    }

    private static String normalizeSnapshotForModel(String raw, long generation,
                                                    String fridgeId, String weekStart) {
        try {
            JSONObject source = new JSONObject(raw);
            JSONArray rows = source.optJSONArray("entries");
            if (rows == null) rows = source.optJSONArray("snapshots");
            if (rows == null) {
                rows = new JSONArray();
                JSONArray days = source.optJSONArray("days");
                if (days != null) {
                    for (int dayIndex = 0; dayIndex < days.length(); dayIndex++) {
                        JSONObject day = days.optJSONObject(dayIndex);
                        if (day == null) continue;
                        JSONArray dayEntries = day.optJSONArray("entries");
                        if (dayEntries == null) continue;
                        for (int entryIndex = 0; entryIndex < dayEntries.length(); entryIndex++) {
                            JSONObject entry = dayEntries.optJSONObject(entryIndex);
                            if (entry == null) continue;
                            rows.put(entryWithDisplayFields(entry, day));
                        }
                    }
                }
            }
            JSONArray normalized = new JSONArray();
            for (int index = 0; index < rows.length(); index++) {
                JSONObject row = rows.optJSONObject(index);
                if (row != null) normalized.put(entryWithDisplayFields(row, source));
            }
            JSONObject result = new JSONObject();
            result.put("accountGeneration", generation);
            result.put("fridgeId", source.optString("fridgeId", fridgeId));
            result.put("fridgeName", source.optString("fridgeName", fridgeId));
            result.put("accessRole", source.optString("accessRole", "owner"));
            result.put("weekStart", source.optString("weekStart", weekStart));
            result.put("capturedAt", source.optLong("capturedAt", 0L));
            result.put("entries", normalized);
            result.put("status", source.optString("status", "ready"));
            return result.toString();
        } catch (JSONException exception) {
            throw new IllegalArgumentException("snapshot JSON is invalid", exception);
        }
    }

    private static JSONObject entryWithDisplayFields(JSONObject source, JSONObject parent) throws JSONException {
        JSONObject entry = new JSONObject(source.toString());
        if (!entry.has("weekday")) entry.put("weekday", 0);
        if (!entry.has("label")) entry.put("label", parent.optString("label", "周一"));
        if (!entry.has("dishName")) entry.put("dishName", parent.optString("dishName", "食谱"));
        if (!entry.has("completed")) entry.put("completed", false);
        if (!entry.has("missingCount")) entry.put("missingCount", 0);
        if (!entry.has("pending")) entry.put("pending", false);
        Object display = entry.opt("ingredientsDisplay");
        if (!(display instanceof JSONArray)) {
            JSONArray ingredients = new JSONArray();
            if (display instanceof String && !((String) display).isEmpty()) {
                ingredients.put(new JSONObject().put("name", display));
            }
            entry.put("ingredientsDisplay", ingredients);
        }
        return entry;
    }

    /** Publishes one bridge-ready display row, merging it into the scoped week snapshot. */
    public synchronized void saveSnapshot(JSONObject row) {
        if (row == null) throw new IllegalArgumentException("snapshot is required");
        String fridgeId = row.optString("refrigeratorId", "");
        String weekStart = row.optString("weekStart", "");
        requireSnapshotPart(fridgeId, weekStart);
        long generation = getAccountGeneration();
        JSONObject snapshot = getSnapshot(generation, fridgeId, weekStart);
        if (snapshot == null) {
            snapshot = new JSONObject();
            try {
                snapshot.put("accountGeneration", generation)
                        .put("fridgeId", fridgeId)
                        .put("fridgeName", "")
                        .put("accessRole", "owner")
                        .put("weekStart", weekStart)
                        .put("capturedAt", row.optLong("capturedAt", 0L))
                        .put("entries", new JSONArray())
                        .put("status", "ready");
            } catch (JSONException impossible) {
                throw new IllegalStateException("snapshot encoding failed", impossible);
            }
        }
        JSONArray entries = snapshot.optJSONArray("entries");
        if (entries == null) entries = new JSONArray();
        String id = row.optString("id", "");
        if (id.isEmpty()) throw new IllegalArgumentException("snapshot id is required");
        JSONArray next = new JSONArray();
        boolean replaced = false;
        for (int index = 0; index < entries.length(); index++) {
            JSONObject existing = entries.optJSONObject(index);
            if (existing == null) continue;
            if (id.equals(existing.optString("id", ""))) {
                next.put(row);
                replaced = true;
            } else next.put(existing);
        }
        if (!replaced) next.put(row);
        try {
            snapshot.put("entries", next).put("capturedAt", row.optLong("capturedAt", 0L));
        } catch (JSONException impossible) {
            throw new IllegalStateException("snapshot encoding failed", impossible);
        }
        putSnapshot(generation, fridgeId, weekStart, snapshot);
    }

    /** Removes all cached data for a refrigerator, including every account generation. */
    public synchronized void clearFridge(String fridgeId) {
        requireId(fridgeId, "fridgeId");
        SharedPreferences.Editor editor = preferences.edit().remove(summaryKey(fridgeId));
        for (String key : preferences.getAll().keySet()) {
            if (key.startsWith(SNAPSHOT_PREFIX) && key.contains("." + digest(fridgeId) + ".")) {
                editor.remove(key);
            } else if (key.startsWith(CONFIG_PREFIX)) {
                String raw = preferences.getString(key, null);
                try {
                    if (raw != null && fridgeId.equals(new JSONObject(raw).optString("fridgeId", ""))) {
                        String widgetId = key.substring(CONFIG_PREFIX.length());
                        editor.remove(key).putString(STATE_PREFIX + widgetId, "auth_expired");
                    }
                } catch (JSONException ignored) {
                    editor.remove(key);
                }
            }
        }
        commit(editor, "refrigerator cache removal failed");
    }

    /** Backwards-compatible name used by the Capacitor bridge. */
    public void clearForFridge(String fridgeId) {
        clearFridge(fridgeId);
    }

    /** Clears published summaries/snapshots and advances the account namespace. */
    public synchronized void clearAllAndAdvanceGeneration() {
        SharedPreferences.Editor editor = preferences.edit();
        for (String key : preferences.getAll().keySet()) {
            if (key.startsWith(SUMMARY_PREFIX) || key.startsWith(SNAPSHOT_PREFIX)) editor.remove(key);
        }
        commit(editor, "widget cache clear failed");
        sessionStore.advanceAccountGeneration();
    }

    /** Removes every snapshot except the current account generation. */
    public synchronized void clearStaleSnapshots(long accountGeneration) {
        String marker = SNAPSHOT_PREFIX + accountGeneration + ".";
        SharedPreferences.Editor editor = preferences.edit();
        for (String key : preferences.getAll().keySet()) {
            if (key.startsWith(SNAPSHOT_PREFIX) && !key.startsWith(marker)) editor.remove(key);
        }
        commit(editor, "stale snapshot removal failed");
    }

    /** Returns the current account generation shared with authentication workers. */
    public long getAccountGeneration() {
        return sessionStore.getAccountGeneration();
    }

    /** Advances the account generation after an explicit account switch. */
    public long advanceAccountGeneration() {
        return sessionStore.advanceAccountGeneration();
    }

    /** Returns all configured widget IDs for cleanup and refresh scheduling. */
    public synchronized List<Integer> configuredWidgetIds() {
        List<Integer> ids = new ArrayList<>();
        for (String key : preferences.getAll().keySet()) {
            if (!key.startsWith(CONFIG_PREFIX)) continue;
            try {
                ids.add(Integer.parseInt(key.substring(CONFIG_PREFIX.length())));
            } catch (NumberFormatException ignored) {
                // Ignore unrelated/corrupt preference entries.
            }
        }
        Collections.sort(ids);
        return ids;
    }

    private static String configKey(int widgetId) {
        return CONFIG_PREFIX + widgetId;
    }

    private static String stateKey(int widgetId) {
        return STATE_PREFIX + widgetId;
    }

    private static String summaryKey(String fridgeId) {
        return SUMMARY_PREFIX + digest(fridgeId);
    }

    private static String snapshotKey(long generation, String fridgeId, String weekStart) {
        return SNAPSHOT_PREFIX + generation + "." + digest(fridgeId) + "." + weekStart;
    }

    private static String digest(String value) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8));
            StringBuilder result = new StringBuilder(digest.length * 2);
            for (byte item : digest) result.append(String.format("%02x", item & 0xff));
            return result.toString();
        } catch (NoSuchAlgorithmException impossible) {
            throw new AssertionError(impossible);
        }
    }

    private static void requireId(String value, String name) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(name + " is required");
    }

    private static void requireSnapshotPart(String fridgeId, String weekStart) {
        requireId(fridgeId, "fridgeId");
        requireId(weekStart, "weekStart");
        if (!weekStart.matches("\\d{4}-\\d{2}-\\d{2}")) {
            throw new IllegalArgumentException("weekStart must be YYYY-MM-DD");
        }
    }

    private static void commit(SharedPreferences.Editor editor, String message) {
        if (!editor.commit()) throw new IllegalStateException(message);
    }
}
