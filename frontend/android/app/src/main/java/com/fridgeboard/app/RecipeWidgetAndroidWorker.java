package com.fridgeboard.app;

import android.content.Context;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

/** WorkManager adapter that runs the pure widget coordinator and converges the rendered state. */
public final class RecipeWidgetAndroidWorker extends Worker {
    private static final String TAG = "RecipeWidgetWorker";

    public RecipeWidgetAndroidWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        runWork(getApplicationContext(), getInputData());
        return Result.success();
    }

    /** 在系统作业或旧版 WorkManager 中执行同一份同步与回滚逻辑。 */
    static void runWork(Context context, androidx.work.Data data) {
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        int widgetId = data.getInt(RecipeWidgetWorkScheduler.KEY_WIDGET_ID,
                android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID);
        String fridgeId = data.getString(RecipeWidgetWorkScheduler.KEY_FRIDGE_ID);
        boolean staleRecovery = data.getBoolean(
                RecipeWidgetWorkScheduler.KEY_STALE_RECOVERY, false);
        RecipeWidgetWorker.Input input = null;
        RecipeWidgetWorker.Outcome outcome = null;
        Log.i(TAG, "work start widget=" + widgetId + " fridge=" + fridgeId
                + " staleRecovery=" + staleRecovery);
        try {
            input = inputFromData(data);
            outcome = new RecipeWidgetWorker(repository,
                    new RecipeWidgetApiClient(new SecureSessionStore(context))).run(input);
            Log.i(TAG, "work outcome widget=" + widgetId + " code=" + outcome.code
                    + " snapshotUpdated=" + outcome.snapshotUpdated + " status="
                    + outcome.statusCode);
            persistOutcome(repository, widgetId, fridgeId, outcome, staleRecovery);
        } catch (Exception exception) {
            try {
                if (fridgeId == null || fridgeId.isEmpty()) {
                    persistState(repository, widgetId, "failed");
                } else {
                    persistStateForFridge(repository, fridgeId, "failed");
                }
            } catch (RuntimeException stateException) {
                Log.w(TAG, "widget failure state could not be persisted", stateException);
            }
            Log.w(TAG, "widget work failed", exception);
        } finally {
            try {
                boolean action = input != null && input.expectedCompleted != null;
                boolean redraw = shouldRedrawAfterOutcome(outcome, action);
                Log.i(TAG, "work redraw widget=" + widgetId + " fridge=" + fridgeId
                        + " outcome=" + (outcome == null ? "null" : outcome.code)
                        + " redraw=" + redraw);
                if (redraw) {
                    if (outcome == null || !isSuccessful(outcome.code)) {
                        rollbackOptimisticToggle(repository, input);
                    }
                    if (fridgeId == null || fridgeId.isEmpty()) {
                        RecipeWidgetProvider.refreshWidget(context, widgetId);
                    } else {
                        RecipeWidgetProvider.refresh(context, fridgeId);
                    }
                }
            } catch (RuntimeException exception) {
                Log.w(TAG, "widget redraw failed", exception);
            }
        }
        // Network/timeout failures are terminal; stale generations get at most one recovery pass.
    }

    private static void rollbackOptimisticToggle(RecipeWidgetRepository repository,
                                                 RecipeWidgetWorker.Input input) {
        if (input == null || input.expectedCompleted == null) return;
        repository.rollbackOptimisticToggle(input.accountGeneration, input.refrigeratorId,
                input.weekStart, input.entryId, input.expectedCompleted);
    }

    static boolean shouldRedrawAfterOutcome(RecipeWidgetWorker.Outcome outcome, boolean action) {
        if (outcome == null || !isSuccessful(outcome.code)) return true;
        return !action && outcome.snapshotUpdated;
    }

    private static boolean isSuccessful(RecipeWidgetWorker.Outcome.Code code) {
        return code == RecipeWidgetWorker.Outcome.Code.UPDATED
                || code == RecipeWidgetWorker.Outcome.Code.NOOP;
    }

    private static RecipeWidgetWorker.Input inputFromData(androidx.work.Data data) {
        String fridgeId = data.getString(RecipeWidgetWorkScheduler.KEY_FRIDGE_ID);
        String entryId = data.getString(RecipeWidgetWorkScheduler.KEY_ENTRY_ID);
        String weekStart = data.getString(RecipeWidgetWorkScheduler.KEY_WEEK_START);
        boolean hasExpected = data.getKeyValueMap().containsKey(
                RecipeWidgetWorkScheduler.KEY_EXPECTED_COMPLETED);
        Boolean expected = hasExpected ? data.getBoolean(
                RecipeWidgetWorkScheduler.KEY_EXPECTED_COMPLETED, false) : null;
        return new RecipeWidgetWorker.Input(
                data.getInt(RecipeWidgetWorkScheduler.KEY_WIDGET_ID,
                        android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID),
                fridgeId, entryId, weekStart, expected,
                data.getLong(RecipeWidgetWorkScheduler.KEY_ACCOUNT_GENERATION, -1L));
    }

    private static void persistOutcome(RecipeWidgetRepository repository, int widgetId,
                                       String fridgeId, RecipeWidgetWorker.Outcome outcome,
                                       boolean staleRecovery) {
        String state = outcome == null ? "failed" : stateForOutcome(outcome.code,
                outcome.errorCode, staleRecovery);
        if (outcome == null) {
            if (fridgeId == null || fridgeId.isEmpty()) {
                persistState(repository, widgetId, state);
            } else {
                persistStateForFridge(repository, fridgeId, state);
            }
            return;
        }
        // Auth revocation clears all bindings in RecipeWidgetWorker; keep its explicit
        // cleanup path intact and only fan out ordinary outcomes to surviving bindings.
        if (outcome.code == RecipeWidgetWorker.Outcome.Code.AUTH_REVOKED
                || fridgeId == null || fridgeId.isEmpty()) {
            persistState(repository, widgetId, state);
        } else {
            persistStateForFridge(repository, fridgeId, state);
        }
        if (outcome.code == RecipeWidgetWorker.Outcome.Code.STALE_GENERATION && !staleRecovery
                && !RecipeWidgetWorkScheduler.enqueueStaleRecovery(repository.getContext(), widgetId)) {
            if (fridgeId == null || fridgeId.isEmpty()) {
                persistState(repository, widgetId, "failed");
            } else {
                persistStateForFridge(repository, fridgeId, "failed");
            }
        }
    }

    private static void persistStateForFridge(RecipeWidgetRepository repository, String fridgeId,
                                              String state) {
        if (fridgeId == null || fridgeId.isEmpty()) return;
        for (Integer configuredId : repository.configuredWidgetIds()) {
            RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(configuredId);
            if (binding != null && binding.fridgeId.equals(fridgeId)) {
                repository.setWidgetState(configuredId, state);
            }
        }
    }

    static String stateForOutcome(RecipeWidgetWorker.Outcome.Code code,
                                  RecipeWidgetApiClient.ErrorCode errorCode) {
        return stateForOutcome(code, errorCode, false);
    }

    static String stateForOutcome(RecipeWidgetWorker.Outcome.Code code,
                                  RecipeWidgetApiClient.ErrorCode errorCode,
                                  boolean staleRecovery) {
        switch (code) {
            case AUTH_REVOKED:
                return "auth_expired";
            case FAILED:
                return errorCode == RecipeWidgetApiClient.ErrorCode.NETWORK
                        || errorCode == RecipeWidgetApiClient.ErrorCode.TIMEOUT
                        ? "offline" : "failed";
            case STALE_GENERATION:
                return staleRecovery ? "failed" : "loading";
            default:
                return "idle";
        }
    }

    private static void persistState(RecipeWidgetRepository repository, int widgetId, String state) {
        if (widgetId == android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID) return;
        repository.setWidgetState(widgetId, state);
    }

}
