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
        Context context = getApplicationContext();
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        int widgetId = getInputData().getInt(RecipeWidgetWorkScheduler.KEY_WIDGET_ID,
                android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID);
        String fridgeId = getInputData().getString(RecipeWidgetWorkScheduler.KEY_FRIDGE_ID);
        boolean staleRecovery = getInputData().getBoolean(
                RecipeWidgetWorkScheduler.KEY_STALE_RECOVERY, false);
        RecipeWidgetWorker.Outcome outcome = null;
        try {
            RecipeWidgetWorker.Input input = inputFromData();
            outcome = new RecipeWidgetWorker(repository,
                    new RecipeWidgetApiClient(new SecureSessionStore(context))).run(input);
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
                if (fridgeId == null || fridgeId.isEmpty()) {
                    RecipeWidgetProvider.refreshWidget(context, widgetId);
                } else {
                    RecipeWidgetProvider.refresh(context, fridgeId);
                    if (outcome != null
                            && outcome.code == RecipeWidgetWorker.Outcome.Code.AUTH_REVOKED) {
                        RecipeWidgetProvider.refreshWidget(context, widgetId);
                    }
                }
            } catch (RuntimeException exception) {
                Log.w(TAG, "widget redraw failed", exception);
            }
        }
        // Network/timeout failures are terminal; stale generations get at most one recovery pass.
        return Result.success();
    }

    private RecipeWidgetWorker.Input inputFromData() {
        String fridgeId = getInputData().getString(RecipeWidgetWorkScheduler.KEY_FRIDGE_ID);
        String entryId = getInputData().getString(RecipeWidgetWorkScheduler.KEY_ENTRY_ID);
        String weekStart = getInputData().getString(RecipeWidgetWorkScheduler.KEY_WEEK_START);
        boolean hasExpected = getInputData().getKeyValueMap().containsKey(
                RecipeWidgetWorkScheduler.KEY_EXPECTED_COMPLETED);
        Boolean expected = hasExpected ? getInputData().getBoolean(
                RecipeWidgetWorkScheduler.KEY_EXPECTED_COMPLETED, false) : null;
        return new RecipeWidgetWorker.Input(
                getInputData().getInt(RecipeWidgetWorkScheduler.KEY_WIDGET_ID,
                        android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID),
                fridgeId, entryId, weekStart, expected,
                getInputData().getLong(RecipeWidgetWorkScheduler.KEY_ACCOUNT_GENERATION, -1L));
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
