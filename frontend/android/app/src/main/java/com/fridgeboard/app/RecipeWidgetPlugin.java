package com.fridgeboard.app;

import android.content.Context;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** Capacitor bridge for bounded, account-scoped recipe widget snapshots. */
@CapacitorPlugin(name = "RecipeWidget")
public class RecipeWidgetPlugin extends Plugin {
    private static final int MAX_FRIDGES = 32;
    private static final int MAX_SNAPSHOTS = 64;
    private static final int MAX_ID_LENGTH = 128;
    private static final int MAX_NAME_LENGTH = 128;
    private static final int MAX_LABEL_LENGTH = 32;
    private static final int MAX_DISH_NAME_LENGTH = 128;
    private static final int MAX_INGREDIENTS_DISPLAY_LENGTH = 256;
    private static final int MAX_JSON_LENGTH = 64 * 1024;
    private static final String INVALID_PAYLOAD = "INVALID_WIDGET_PAYLOAD";

    private RecipeWidgetRepository repository;

    @Override
    public void load() {
        super.load();
        repository = new RecipeWidgetRepository(getBridge().getContext());
    }

    @PluginMethod
    public void publishFridges(PluginCall call) {
        try {
            validatePayloadSize(call);
            JSONArray fridges = requireArray(call, "fridges");
            validateFridges(fridges);
            repository().replaceFridgeSummaries(fridges);
            refresh(null);
            call.resolve();
        } catch (JSONException | IllegalArgumentException exception) {
            call.reject("invalid widget refrigerator payload", INVALID_PAYLOAD);
        } catch (RuntimeException exception) {
            call.reject("unable to save widget refrigerator payload", "WIDGET_STORAGE_FAILED", exception);
        }
    }

    @PluginMethod
    public void publishWeek(PluginCall call) {
        try {
            validatePayloadSize(call);
            JSONObject refrigerator = requireObject(call, "refrigerator");
            String refrigeratorId = requireString(refrigerator, "id", MAX_ID_LENGTH);
            requireString(refrigerator, "name", MAX_NAME_LENGTH);
            validateAccessRole(requireString(refrigerator, "accessRole", 32));
            String weekStart = requireWeekStart(call.getString("weekStart"));
            long capturedAt = requireLong(call.getData(), "capturedAt");
            if (capturedAt < 0) throw new IllegalArgumentException("capturedAt is invalid");
            JSONArray entries = requireArray(call, "entries");
            validateSnapshots(entries);
            long accountGeneration = repository().getAccountGeneration();
            JSONObject scopedSnapshot = buildScopedSnapshot(refrigerator, weekStart, capturedAt,
                    entries, accountGeneration);
            repository().putSnapshot(accountGeneration, refrigeratorId, weekStart, scopedSnapshot);
            refresh(refrigeratorId);
            call.resolve();
        } catch (JSONException | IllegalArgumentException exception) {
            call.reject("invalid widget recipe payload", INVALID_PAYLOAD);
        } catch (RuntimeException exception) {
            call.reject("unable to save widget recipe payload", "WIDGET_STORAGE_FAILED", exception);
        }
    }

    @PluginMethod
    public void refreshWidgets(PluginCall call) {
        try {
            String refrigeratorId = optionalString(call.getString("refrigeratorId"), MAX_ID_LENGTH);
            refresh(refrigeratorId);
            call.resolve();
        } catch (IllegalArgumentException exception) {
            call.reject("invalid widget refrigerator id", INVALID_PAYLOAD);
        } catch (RuntimeException exception) {
            call.reject("unable to refresh recipe widgets", "WIDGET_REFRESH_FAILED", exception);
        }
    }

    @PluginMethod
    public void clearForFridge(PluginCall call) {
        try {
            String refrigeratorId = requireString(call.getString("refrigeratorId"), MAX_ID_LENGTH);
            repository().clearFridge(refrigeratorId);
            refresh(refrigeratorId);
            call.resolve();
        } catch (IllegalArgumentException exception) {
            call.reject("invalid widget refrigerator id", INVALID_PAYLOAD);
        } catch (RuntimeException exception) {
            call.reject("unable to clear recipe widget data", "WIDGET_STORAGE_FAILED", exception);
        }
    }

    @PluginMethod
    public void clearAll(PluginCall call) {
        try {
            clearAllData();
            refresh(null);
            call.resolve();
        } catch (RuntimeException exception) {
            call.reject("unable to clear recipe widget data", "WIDGET_STORAGE_FAILED", exception);
        }
    }

    @PluginMethod
    public void advanceAccountGeneration(PluginCall call) {
        try {
            long generation = repository().advanceAccountGeneration();
            repository().clearStaleSnapshots(generation);
            refresh(null);
            call.resolve();
        } catch (RuntimeException exception) {
            call.reject("unable to advance widget account generation", "WIDGET_STORAGE_FAILED", exception);
        }
    }

    private RecipeWidgetRepository repository() {
        if (repository == null) throw new IllegalStateException("recipe widget plugin is not loaded");
        return repository;
    }

    private void clearAllData() {
        RecipeWidgetRepository store = repository();
        for (Integer widgetId : store.configuredWidgetIds()) {
            RecipeWidgetRepository.WidgetBinding binding = store.getWidgetBinding(widgetId);
            if (binding != null) store.clearFridge(binding.fridgeId);
            store.removeWidget(widgetId);
        }
        long generation = store.advanceAccountGeneration();
        store.clearStaleSnapshots(generation);
    }

    private void refresh(String refrigeratorId) {
        Context context = getBridge().getContext();
        // Provider currently redraws all instances; its renderer still scopes data by binding.
        RecipeWidgetProvider.refreshAll(context);
    }

    private static JSONArray requireArray(PluginCall call, String key) throws JSONException {
        JSONArray value = call.getArray(key);
        if (value == null) throw new IllegalArgumentException(key + " is required");
        return value;
    }

    private static void validatePayloadSize(PluginCall call) {
        if (call == null || call.getData() == null || call.getData().toString().length() > MAX_JSON_LENGTH) {
            throw new IllegalArgumentException("widget payload is too large");
        }
    }

    private static JSONObject requireObject(PluginCall call, String key) throws JSONException {
        JSONObject value = call.getObject(key);
        if (value == null) throw new IllegalArgumentException(key + " is required");
        return value;
    }

    static JSONObject buildScopedSnapshot(JSONObject refrigerator, String weekStart,
                                          long capturedAt, JSONArray entries,
                                          long accountGeneration) throws JSONException {
        JSONObject result = new JSONObject()
                .put("accountGeneration", accountGeneration)
                .put("fridgeId", refrigerator.getString("id"))
                .put("fridgeName", refrigerator.getString("name"))
                .put("accessRole", refrigerator.getString("accessRole"))
                .put("weekStart", weekStart)
                .put("capturedAt", capturedAt)
                .put("status", "ready")
                .put("error", JSONObject.NULL);
        JSONArray normalizedEntries = new JSONArray();
        for (int index = 0; index < entries.length(); index++) {
            JSONObject source = entries.getJSONObject(index);
            JSONObject entry = new JSONObject()
                    .put("id", source.getString("id"))
                    .put("weekday", source.getInt("weekday"))
                    .put("label", source.getString("label"))
                    .put("dishName", source.getString("dishName"))
                    .put("completed", source.getBoolean("completed"))
                    .put("missingCount", source.getInt("missingCount"))
                    .put("pending", false);
            String display = source.getString("ingredientsDisplay").trim();
            JSONArray ingredients = new JSONArray();
            if (!display.isEmpty()) {
                ingredients.put(new JSONObject()
                        .put("name", display)
                        .put("quantity", JSONObject.NULL)
                        .put("unit", JSONObject.NULL)
                        .put("missing", source.getInt("missingCount") > 0));
            }
            entry.put("ingredientsDisplay", ingredients);
            normalizedEntries.put(entry);
        }
        return result.put("entries", normalizedEntries);
    }

    private static void validateFridges(JSONArray fridges) throws JSONException {
        if (fridges.length() > MAX_FRIDGES) throw new IllegalArgumentException("too many refrigerators");
        for (int index = 0; index < fridges.length(); index++) {
            JSONObject fridge = fridges.optJSONObject(index);
            if (fridge == null) throw new IllegalArgumentException("fridge must be an object");
            requireString(fridge, "id", MAX_ID_LENGTH);
            requireString(fridge, "name", MAX_NAME_LENGTH);
            validateAccessRole(requireString(fridge, "accessRole", 32));
        }
    }

    private static void validateSnapshots(JSONArray snapshots) throws JSONException {
        if (snapshots.length() > MAX_SNAPSHOTS) throw new IllegalArgumentException("too many snapshots");
        for (int index = 0; index < snapshots.length(); index++) {
            JSONObject snapshot = snapshots.optJSONObject(index);
            if (snapshot == null) throw new IllegalArgumentException("snapshot must be an object");
            requireString(snapshot, "id", MAX_ID_LENGTH);
            requireString(snapshot, "label", MAX_LABEL_LENGTH);
            requireString(snapshot, "dishName", MAX_DISH_NAME_LENGTH);
            String ingredients = requireStringAllowEmpty(snapshot, "ingredientsDisplay", MAX_INGREDIENTS_DISPLAY_LENGTH);
            if (ingredients.length() > MAX_INGREDIENTS_DISPLAY_LENGTH) throw new IllegalArgumentException("ingredientsDisplay is too long");
            int weekday = requireInt(snapshot, "weekday");
            if (weekday < 0 || weekday > 6) throw new IllegalArgumentException("weekday is invalid");
            if (!snapshot.has("completed") || snapshot.isNull("completed") || !(snapshot.get("completed") instanceof Boolean)) {
                throw new IllegalArgumentException("completed is invalid");
            }
            int missingCount = requireInt(snapshot, "missingCount");
            if (missingCount < 0) throw new IllegalArgumentException("missingCount is invalid");
        }
    }

    private static String requireWeekStart(String value) {
        String normalized = requireString(value, 10);
        if (!normalized.matches("\\d{4}-\\d{2}-\\d{2}")) throw new IllegalArgumentException("weekStart is invalid");
        return normalized;
    }

    private static void validateAccessRole(String value) {
        if (!"owner".equals(value) && !"daily_access".equals(value)) {
            throw new IllegalArgumentException("accessRole is invalid");
        }
    }

    private static String requireString(JSONObject object, String key, int maxLength) throws JSONException {
        if (!object.has(key) || object.isNull(key) || !(object.get(key) instanceof String)) {
            throw new IllegalArgumentException(key + " is invalid");
        }
        return requireString(object.getString(key), maxLength);
    }

    private static String requireStringAllowEmpty(JSONObject object, String key, int maxLength) throws JSONException {
        if (!object.has(key) || object.isNull(key) || !(object.get(key) instanceof String)) {
            throw new IllegalArgumentException(key + " is invalid");
        }
        String normalized = object.getString(key).trim();
        if (normalized.length() > maxLength) throw new IllegalArgumentException(key + " is too long");
        return normalized;
    }

    private static String requireString(String value, int maxLength) {
        if (value == null) throw new IllegalArgumentException("string is required");
        String normalized = value.trim();
        if (normalized.isEmpty() || normalized.length() > maxLength) throw new IllegalArgumentException("string is invalid");
        return normalized;
    }

    private static String optionalString(String value, int maxLength) {
        if (value == null) return null;
        return requireString(value, maxLength);
    }

    private static int requireInt(JSONObject object, String key) throws JSONException {
        if (!object.has(key) || object.isNull(key) || !(object.get(key) instanceof Number)) {
            throw new IllegalArgumentException(key + " is invalid");
        }
        Number value = (Number) object.get(key);
        if (value.doubleValue() != value.intValue()) throw new IllegalArgumentException(key + " is invalid");
        return value.intValue();
    }

    private static long requireLong(JSONObject object, String key) throws JSONException {
        if (!object.has(key) || object.isNull(key) || !(object.get(key) instanceof Number)) {
            throw new IllegalArgumentException(key + " is invalid");
        }
        Number value = (Number) object.get(key);
        if (value.doubleValue() != value.longValue()) throw new IllegalArgumentException(key + " is invalid");
        return value.longValue();
    }
}
