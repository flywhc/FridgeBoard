package com.fridgeboard.app;

import android.content.Context;
import android.content.ComponentName;
import android.content.Intent;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.app.job.JobWorkItem;
import android.os.Build;
import android.util.Log;

import androidx.work.Data;
import androidx.work.ExistingWorkPolicy;
import androidx.work.OneTimeWorkRequest;
import androidx.work.WorkManager;

import java.util.HashSet;
import java.util.Set;

/** Enqueues token-free, one-shot widget work in a serial chain per refrigerator. */
public final class RecipeWidgetWorkScheduler {
    private static final String TAG = "RecipeWidgetScheduler";
    static final String KEY_WIDGET_ID = "widgetId";
    static final String KEY_FRIDGE_ID = "fridgeId";
    static final String KEY_ENTRY_ID = "entryId";
    static final String KEY_WEEK_START = "weekStart";
    static final String KEY_EXPECTED_COMPLETED = "expectedCompleted";
    static final String KEY_ACCOUNT_GENERATION = "accountGeneration";
    static final String KEY_STALE_RECOVERY = "staleRecovery";
    private static final String UNIQUE_PREFIX = "recipe-widget-fridge-";
    private static final int WIDGET_JOB_ID = 84721;

    private RecipeWidgetWorkScheduler() {
    }

    /** Enqueues a refresh for the configured widget's current local week. */
    public static boolean enqueueRefresh(Context context, int widgetId) {
        return enqueue(context, widgetId, null, null, false, ExistingWorkPolicy.APPEND_OR_REPLACE);
    }

    /** Enqueues the startup refresh after replacing any work left by an older process. */
    static boolean enqueueStartupRefresh(Context context, int widgetId) {
        return enqueue(context, widgetId, null, null, false, ExistingWorkPolicy.REPLACE);
    }

    /** Enqueues the single replacement refresh allowed after a stale-generation result. */
    static boolean enqueueStaleRecovery(Context context, int widgetId) {
        return enqueue(context, widgetId, null, null, true, ExistingWorkPolicy.APPEND_OR_REPLACE);
    }

    /** Enqueues an expected-state guarded complete/undo action for a widget entry. */
    public static boolean enqueueAction(Context context, int widgetId, String entryId,
                                        Boolean expectedCompleted) {
        if (entryId == null || entryId.trim().isEmpty() || expectedCompleted == null) return false;
        return enqueue(context, widgetId, entryId, expectedCompleted, false,
                ExistingWorkPolicy.APPEND_OR_REPLACE);
    }

    private static boolean enqueue(Context context, int widgetId, String entryId,
                                   Boolean expectedCompleted, boolean staleRecovery,
                                   ExistingWorkPolicy workPolicy) {
        if (context == null) return false;
        Context appContext = context.getApplicationContext();
        try {
            RecipeWidgetRepository repository = new RecipeWidgetRepository(appContext);
            RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
            if (binding == null) return false;
            String weekStart = RecipeWidgetRules.weekStart();
            long generation = repository.getAccountGeneration();
            Data.Builder input = new Data.Builder()
                    .putInt(KEY_WIDGET_ID, widgetId)
                    .putString(KEY_FRIDGE_ID, binding.fridgeId)
                    .putString(KEY_WEEK_START, weekStart)
                    .putLong(KEY_ACCOUNT_GENERATION, generation)
                    .putBoolean(KEY_STALE_RECOVERY, staleRecovery);
            if (entryId != null) {
                input.putString(KEY_ENTRY_ID, entryId);
                input.putBoolean(KEY_EXPECTED_COMPLETED, expectedCompleted);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                JobScheduler scheduler = appContext.getSystemService(JobScheduler.class);
                // 固定作业 ID 保留队列顺序；不启停组件，避免 PACKAGE_CHANGED 清空宿主视图。
                JobInfo job = new JobInfo.Builder(WIDGET_JOB_ID,
                        new ComponentName(appContext, RecipeWidgetJobService.class))
                        .setOverrideDeadline(0).build();
                Intent work = new Intent()
                        .putExtra("input", input.build().toByteArray());
                return scheduler.enqueue(job, new JobWorkItem(work)) == JobScheduler.RESULT_SUCCESS;
            }
            OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(RecipeWidgetAndroidWorker.class)
                    .setInputData(input.build())
                    .build();
            // Preserve queued actions, but replace a terminally failed/cancelled chain.
            WorkManager.getInstance(appContext).beginUniqueWork(
                    uniqueWorkName(binding.fridgeId),
                    workPolicy, request).enqueue();
            return true;
        } catch (RuntimeException exception) {
            // Broadcasts must not crash the launcher when WorkManager is unavailable.
            Log.w(TAG, "unable to enqueue widget work", exception);
            return false;
        }
    }

    /** Cancels refresh chains left by an older app process before scheduling startup work. */
    public static void cancelConfiguredRefreshChains(Context context) {
        if (context == null) return;
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) return;
        Context appContext = context.getApplicationContext();
        try {
            RecipeWidgetRepository repository = new RecipeWidgetRepository(appContext);
            Set<String> names = new HashSet<>();
            for (Integer widgetId : repository.configuredWidgetIds()) {
                RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
                if (binding != null) names.add(uniqueWorkName(binding.fridgeId));
            }
            WorkManager manager = WorkManager.getInstance(appContext);
            for (String name : names) {
                manager.cancelUniqueWork(name);
            }
        } catch (RuntimeException exception) {
            Log.w(TAG, "unable to cancel stale widget work", exception);
        }
    }

    private static String uniqueWorkName(String fridgeId) {
        return UNIQUE_PREFIX + RecipeWidgetApiClient.encode(fridgeId);
    }
}
