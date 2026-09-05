package com.fridgeboard.app;

import android.content.Context;
import android.util.Log;

import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

/** Enqueues token-free, one-shot widget work in a serial chain per refrigerator. */
public final class RecipeWidgetWorkScheduler {
    private static final String TAG = "RecipeWidgetScheduler";
    static final String KEY_WIDGET_ID = "widgetId";
    static final String KEY_FRIDGE_ID = "fridgeId";
    static final String KEY_ENTRY_ID = "entryId";
    static final String KEY_WEEK_START = "weekStart";
    static final String KEY_EXPECTED_COMPLETED = "expectedCompleted";
    static final String KEY_ACCOUNT_GENERATION = "accountGeneration";
    private static final String UNIQUE_PREFIX = "recipe-widget-fridge-";

    private RecipeWidgetWorkScheduler() {
    }

    /** Enqueues a refresh for the configured widget's current local week. */
    public static void enqueueRefresh(Context context, int widgetId) {
        enqueue(context, widgetId, null, null);
    }

    /** Enqueues an expected-state guarded complete/undo action for a widget entry. */
    public static void enqueueAction(Context context, int widgetId, String entryId,
                                     Boolean expectedCompleted) {
        if (entryId == null || entryId.trim().isEmpty() || expectedCompleted == null) return;
        enqueue(context, widgetId, entryId, expectedCompleted);
    }

    private static void enqueue(Context context, int widgetId, String entryId,
                                Boolean expectedCompleted) {
        if (context == null) return;
        Context appContext = context.getApplicationContext();
        try {
            RecipeWidgetRepository repository = new RecipeWidgetRepository(appContext);
            RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
            if (binding == null) return;
            String weekStart = RecipeWidgetRules.weekStart();
            long generation = repository.getAccountGeneration();
            Data.Builder input = new Data.Builder()
                    .putInt(KEY_WIDGET_ID, widgetId)
                    .putString(KEY_FRIDGE_ID, binding.fridgeId)
                    .putString(KEY_WEEK_START, weekStart)
                    .putLong(KEY_ACCOUNT_GENERATION, generation);
            if (entryId != null) {
                input.putString(KEY_ENTRY_ID, entryId);
                input.putBoolean(KEY_EXPECTED_COMPLETED, expectedCompleted);
            }
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(RecipeWidgetAndroidWorker.class)
                    .setInputData(input.build())
                    .build();
            // Preserve queued actions, but replace a terminally failed/cancelled chain.
            WorkManager.getInstance(appContext).beginUniqueWork(
                    UNIQUE_PREFIX + RecipeWidgetApiClient.encode(binding.fridgeId),
                    ExistingWorkPolicy.APPEND_OR_REPLACE, request).enqueue();
        } catch (RuntimeException exception) {
            // Broadcasts must not crash the launcher when WorkManager is unavailable.
            Log.w(TAG, "unable to enqueue widget work", exception);
        }
    }
}
