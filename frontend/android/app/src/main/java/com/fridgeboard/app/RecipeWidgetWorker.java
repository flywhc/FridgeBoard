package com.fridgeboard.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.HashMap;
import java.util.Map;

/**
 * Idempotent widget synchronization/action coordinator.
 *
 * <p>The host app schedules one-shot WorkManager work around {@link #run(Input)}. Keeping the
 * coordinator independent of WorkManager makes retry and state-convergence behavior testable and
 * lets the host choose its WorkManager version without putting a dependency in this data layer.</p>
 */
public final class RecipeWidgetWorker {
    /** Supported one-shot operations. */
    public enum Operation { REFRESH, COMPLETE, UNDO }

    /** Whitelisted input passed by a widget PendingIntent/WorkManager request. */
    public static final class Input {
        public final int widgetId;
        public final String refrigeratorId;
        public final String entryId;
        public final String weekStart;
        public final Boolean expectedCompleted;
        public final long accountGeneration;

        /** Creates an input; no credentials or arbitrary request payload are accepted. */
        public Input(int widgetId, String refrigeratorId, String entryId, String weekStart,
                     Boolean expectedCompleted, long accountGeneration) {
            this.widgetId = widgetId;
            this.refrigeratorId = refrigeratorId;
            this.entryId = entryId;
            this.weekStart = weekStart;
            this.expectedCompleted = expectedCompleted;
            this.accountGeneration = accountGeneration;
        }

        /** Compatibility constructor for the host wiring; role and operation are derived/validated by run. */
        public Input(int widgetId, String refrigeratorId, String ignoredAccessRole, String entryId,
                     String weekStart, Boolean expectedCompleted, long accountGeneration,
                     Operation ignoredOperation) {
            this(widgetId, refrigeratorId, entryId, weekStart, expectedCompleted, accountGeneration);
        }

        /** Creates a refresh request. */
        public static Input refresh(int widgetId, String refrigeratorId, String weekStart,
                                    long accountGeneration) {
            return new Input(widgetId, refrigeratorId, null, weekStart, null, accountGeneration);
        }

        /** Compatibility factory for host wiring that already resolved the role. */
        public static Input refresh(int widgetId, String refrigeratorId, String ignoredAccessRole,
                                    String weekStart, long accountGeneration) {
            return refresh(widgetId, refrigeratorId, weekStart, accountGeneration);
        }

        /** Creates an expected-state guarded complete/undo request. */
        public static Input action(int widgetId, String refrigeratorId, String entryId,
                                   String weekStart, boolean expectedCompleted,
                                   long accountGeneration) {
            return new Input(widgetId, refrigeratorId, entryId, weekStart,
                    expectedCompleted, accountGeneration);
        }

        /** Compatibility factory for host wiring that already resolved the role. */
        public static Input action(int widgetId, String refrigeratorId, String ignoredAccessRole,
                                   String entryId, String weekStart, Boolean expectedCompleted,
                                   long accountGeneration, Operation ignoredOperation) {
            if (expectedCompleted == null) throw new IllegalArgumentException("expected state is required");
            return action(widgetId, refrigeratorId, entryId, weekStart, expectedCompleted,
                    accountGeneration);
        }

        /** Derives the server operation from the expected pre-action state. */
        public Operation operation() {
            if (expectedCompleted == null) return Operation.REFRESH;
            return expectedCompleted ? Operation.UNDO : Operation.COMPLETE;
        }
    }

    /** Stable result for rendering and WorkManager retry policy; no server body is exposed. */
    public static final class Outcome {
        public enum Code { UPDATED, NOOP, STALE_GENERATION, STATE_CONFLICT, AUTH_REVOKED, FAILED }

        public final Code code;
        public final RecipeWidgetApiClient.ErrorCode errorCode;
        public final int statusCode;
        public final boolean snapshotUpdated;

        private Outcome(Code code, RecipeWidgetApiClient.ErrorCode errorCode, int statusCode,
                        boolean snapshotUpdated) {
            this.code = code;
            this.errorCode = errorCode;
            this.statusCode = statusCode;
            this.snapshotUpdated = snapshotUpdated;
        }
    }

    private static final Map<String, Object> LOCKS = new HashMap<>();
    private final RecipeWidgetRepository repository;
    private final RecipeWidgetApiClient apiClient;

    /** Creates a coordinator using the application's widget repository and secure session. */
    public RecipeWidgetWorker(RecipeWidgetRepository repository, RecipeWidgetApiClient apiClient) {
        if (repository == null || apiClient == null) throw new IllegalArgumentException("dependencies are required");
        this.repository = repository;
        this.apiClient = apiClient;
    }

    /** Performs one refresh or guarded action and converges using a full-week GET. */
    public Outcome run(Input input) {
        validate(input);
        String lockKey = input.refrigeratorId + ":" + input.weekStart;
        synchronized (lockFor(lockKey)) {
            if (repository.getAccountGeneration() != input.accountGeneration) {
                return outcome(Outcome.Code.STALE_GENERATION, RecipeWidgetApiClient.ErrorCode.NONE, 0, false);
            }
            RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(input.widgetId);
            if (binding == null || !input.refrigeratorId.equals(binding.fridgeId)) {
                return outcome(Outcome.Code.FAILED, RecipeWidgetApiClient.ErrorCode.NO_CREDENTIAL, 0, false);
            }
            Operation operation = input.operation();
            if (operation != Operation.REFRESH && !expectedStateMatches(input)) {
                return converge(input, Outcome.Code.STATE_CONFLICT);
            }
            RecipeWidgetApiClient.Result action = operation == Operation.REFRESH
                    ? RecipeWidgetApiClient.Result.success(200, "")
                    : operation == Operation.COMPLETE
                    ? apiClient.complete(input.refrigeratorId, binding.accessRole, input.entryId)
                    : apiClient.undo(input.refrigeratorId, binding.accessRole, input.entryId);
            if (!action.success && (action.statusCode == 401 || action.statusCode == 403)) {
                repository.clearFridge(input.refrigeratorId);
                return outcome(Outcome.Code.AUTH_REVOKED, action.errorCode, action.statusCode, false);
            }
            if (!action.success && operation != Operation.REFRESH) {
                // A timeout or a 400 can happen after the server committed; GET is authoritative.
                return converge(input, Outcome.Code.FAILED);
            }
            return converge(input, Outcome.Code.UPDATED);
        }
    }

    private Outcome converge(Input input, Outcome.Code fallback) {
        if (repository.getAccountGeneration() != input.accountGeneration) {
            return outcome(Outcome.Code.STALE_GENERATION, RecipeWidgetApiClient.ErrorCode.NONE, 0, false);
        }
        RecipeWidgetApiClient.Result fetched = apiClient.fetchRecipes(
                input.refrigeratorId, roleFor(input), input.weekStart);
        if (!fetched.success) {
            if (fetched.statusCode == 401 || fetched.statusCode == 403) {
                repository.clearFridge(input.refrigeratorId);
                return outcome(Outcome.Code.AUTH_REVOKED, fetched.errorCode, fetched.statusCode, false);
            }
            return outcome(fallback, fetched.errorCode, fetched.statusCode, false);
        }
        try {
            JSONArray days = new JSONArray(fetched.responseJson);
            JSONArray entries = flattenDays(days);
            JSONObject summary = repository.getFridgeSummary(input.refrigeratorId);
            String fridgeName = summary == null ? input.refrigeratorId
                    : summary.optString("name", input.refrigeratorId);
            String accessRole = summary == null ? roleFor(input)
                    : summary.optString("accessRole", summary.optString("access_role", roleFor(input)));
            JSONObject snapshot = new JSONObject()
                    .put("accountGeneration", input.accountGeneration)
                    .put("fridgeId", input.refrigeratorId)
                    .put("fridgeName", fridgeName)
                    .put("accessRole", accessRole)
                    .put("weekStart", input.weekStart)
                    .put("capturedAt", System.currentTimeMillis())
                    .put("entries", entries)
                    .put("status", "ready")
                    .put("error", JSONObject.NULL);
            if (repository.getAccountGeneration() != input.accountGeneration) {
                return outcome(Outcome.Code.STALE_GENERATION, RecipeWidgetApiClient.ErrorCode.NONE, 0, false);
            }
            repository.putSnapshot(input.accountGeneration, input.refrigeratorId,
                    input.weekStart, snapshot);
            Outcome.Code result = convergedCode(input, entries, fallback);
            return outcome(result,
                    RecipeWidgetApiClient.ErrorCode.NONE, 200, true);
        } catch (JSONException exception) {
            return outcome(Outcome.Code.FAILED, RecipeWidgetApiClient.ErrorCode.INVALID_RESPONSE,
                    fetched.statusCode, false);
        }
    }

    private static Outcome.Code convergedCode(Input input, JSONArray entries, Outcome.Code fallback) {
        if (fallback == Outcome.Code.STATE_CONFLICT) return fallback;
        if (fallback != Outcome.Code.FAILED || input.expectedCompleted == null) {
            return Outcome.Code.UPDATED;
        }
        for (int index = 0; index < entries.length(); index++) {
            JSONObject entry = entries.optJSONObject(index);
            if (entry != null && input.entryId.equals(entry.optString("id", ""))) {
                return entry.optBoolean("completed", false) != input.expectedCompleted
                        ? Outcome.Code.UPDATED : Outcome.Code.FAILED;
            }
        }
        return Outcome.Code.FAILED;
    }

    private String roleFor(Input input) {
        RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(input.widgetId);
        return binding == null ? "owner" : binding.accessRole;
    }

    private static JSONArray flattenDays(JSONArray days) throws JSONException {
        JSONArray entries = new JSONArray();
        for (int dayIndex = 0; dayIndex < days.length(); dayIndex++) {
            JSONObject day = days.optJSONObject(dayIndex);
            if (day == null) continue;
            JSONArray dayEntries = day.optJSONArray("entries");
            if (dayEntries == null) continue;
            for (int entryIndex = 0; entryIndex < dayEntries.length(); entryIndex++) {
                JSONObject source = dayEntries.optJSONObject(entryIndex);
                if (source == null) continue;
                JSONArray ingredients = new JSONArray();
                JSONArray missing = source.optJSONArray("missing");
                JSONArray sourceIngredients = source.optJSONArray("ingredients");
                if (sourceIngredients == null) sourceIngredients = new JSONArray();
                for (int ingredientIndex = 0; ingredientIndex < sourceIngredients.length(); ingredientIndex++) {
                    JSONObject ingredient = sourceIngredients.optJSONObject(ingredientIndex);
                    if (ingredient == null) continue;
                    String name = ingredient.optString("subcategory_name", "");
                    ingredients.put(new JSONObject()
                            .put("name", name)
                            .put("quantity", quantityText(ingredient.opt("quantity")))
                            .put("unit", JSONObject.NULL)
                            .put("missing", containsMissing(missing, name)));
                }
                entries.put(new JSONObject()
                        .put("id", source.optString("id", ""))
                        .put("weekday", day.optInt("weekday", 0))
                        .put("label", day.optString("label", "周一"))
                        .put("dishName", source.optString("dish_name", source.optString("dishName", "")))
                        .put("ingredientsDisplay", ingredients)
                        .put("completed", source.optBoolean("completed", false))
                        .put("missingCount", missing == null ? 0 : missing.length())
                        .put("pending", false));
            }
        }
        return entries;
    }

    private static boolean containsMissing(JSONArray missing, String name) {
        if (missing == null) return false;
        for (int index = 0; index < missing.length(); index++) {
            JSONObject item = missing.optJSONObject(index);
            if (item != null && name.equals(item.optString("subcategory_name", ""))) return true;
        }
        return false;
    }

    private static String quantityText(Object value) {
        if (value == null || value == JSONObject.NULL) return "";
        return String.valueOf(value);
    }

    private boolean expectedStateMatches(Input input) {
        JSONObject snapshot = repository.getSnapshot(input.accountGeneration,
                input.refrigeratorId, input.weekStart);
        if (snapshot == null || input.entryId == null || input.expectedCompleted == null) return true;
        try {
            JSONArray entries = snapshot.optJSONArray("entries");
            if (entries == null) return true;
            for (int entryIndex = 0; entryIndex < entries.length(); entryIndex++) {
                JSONObject entry = entries.optJSONObject(entryIndex);
                if (entry != null && input.entryId.equals(entry.optString("id", ""))) {
                    return entry.optBoolean("completed", false) == input.expectedCompleted;
                }
            }
        } catch (RuntimeException ignored) {
            return true;
        }
        return false;
    }

    private static Object lockFor(String key) {
        synchronized (LOCKS) {
            Object lock = LOCKS.get(key);
            if (lock == null) {
                lock = new Object();
                LOCKS.put(key, lock);
            }
            return lock;
        }
    }

    private static Outcome outcome(Outcome.Code code, RecipeWidgetApiClient.ErrorCode errorCode,
                                   int statusCode, boolean snapshotUpdated) {
        return new Outcome(code, errorCode, statusCode, snapshotUpdated);
    }

    private static void validate(Input input) {
        if (input == null || input.refrigeratorId == null || input.refrigeratorId.isEmpty()
                || input.weekStart == null) {
            throw new IllegalArgumentException("widget work input is incomplete");
        }
        if (input.operation() != Operation.REFRESH
                && (input.entryId == null || input.entryId.isEmpty() || input.expectedCompleted == null)) {
            throw new IllegalArgumentException("action input is incomplete");
        }
    }
}
