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
        try {
            RecipeWidgetWorker.Input input = inputFromData();
            RecipeWidgetWorker.Outcome outcome = new RecipeWidgetWorker(repository,
                    new RecipeWidgetApiClient(new SecureSessionStore(context))).run(input);
            persistOutcome(repository, widgetId, outcome);
        } catch (Exception exception) {
            try {
                persistState(repository, widgetId, "failed");
            } catch (RuntimeException stateException) {
                Log.w(TAG, "widget failure state could not be persisted", stateException);
            }
            Log.w(TAG, "widget work failed", exception);
        } finally {
            try {
                RecipeWidgetProvider.refreshAll(context);
            } catch (RuntimeException exception) {
                Log.w(TAG, "widget redraw failed", exception);
            }
        }
        // Network and timeout failures are rendered as offline/failed; no automatic retry.
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
                                       RecipeWidgetWorker.Outcome outcome) {
        if (outcome == null) {
            persistState(repository, widgetId, "failed");
            return;
        }
        switch (outcome.code) {
            case AUTH_REVOKED:
                persistState(repository, widgetId, "auth_expired");
                break;
            case FAILED:
                persistState(repository, widgetId, outcome.errorCode == RecipeWidgetApiClient.ErrorCode.NETWORK
                        || outcome.errorCode == RecipeWidgetApiClient.ErrorCode.TIMEOUT ? "offline" : "failed");
                break;
            default:
                persistState(repository, widgetId, "idle");
        }
    }

    private static void persistState(RecipeWidgetRepository repository, int widgetId, String state) {
        if (widgetId == android.appwidget.AppWidgetManager.INVALID_APPWIDGET_ID) return;
        repository.setWidgetState(widgetId, state);
    }

}
