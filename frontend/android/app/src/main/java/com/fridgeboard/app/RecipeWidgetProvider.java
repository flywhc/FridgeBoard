package com.fridgeboard.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetProvider;
import android.appwidget.AppWidgetManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.RemoteViews;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** Receives widget lifecycle and button broadcasts and delegates data work to the repository/worker. */
public final class RecipeWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_REFRESH = "com.fridgeboard.app.widget.REFRESH";
    public static final String ACTION_TOGGLE = "com.fridgeboard.app.widget.TOGGLE";
    public static final String EXTRA_WIDGET_ID = AppWidgetManager.EXTRA_APPWIDGET_ID;
    public static final String EXTRA_ENTRY_ID = "entry_id";
    public static final String EXTRA_EXPECTED_COMPLETED = "expected_completed";
    private static final String TAG = "RecipeWidget";
    private static final Map<Integer, String> LAST_RENDER_SIGNATURES = new HashMap<>();
    private static final Map<Integer, String> LAST_DATA_SIGNATURES = new HashMap<>();
    private static final int ACTION_CODE_REFRESH = 3;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int widgetId : widgetIds) updateWidget(context, manager, widgetId, null, true);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager,
                                          int widgetId, Bundle newOptions) {
        updateWidget(context, manager, widgetId, null, true);
        // Pixel Launcher can re-apply its pre-resize host view after this callback returns.
        // Redraw once after that host transaction so the outer header follows the new width.
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override public void run() {
                refreshWidget(context, widgetId);
            }
        }, 250L);
    }

    @Override
    public void onDeleted(Context context, int[] widgetIds) {
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        for (int widgetId : widgetIds) {
            repository.removeWidget(widgetId);
            forgetRenderState(widgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent == null ? null : intent.getAction();
        if (isSystemRefreshAction(action)) {
            requestRefreshAll(context);
            return;
        }
        if (!isWidgetAction(action)) return;
        int widgetId = intent.getIntExtra(EXTRA_WIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        Context appContext = context.getApplicationContext();
        if (ACTION_REFRESH.equals(action)) {
            new RecipeWidgetRepository(appContext).setWidgetState(widgetId, "loading");
            updateWidget(appContext, AppWidgetManager.getInstance(appContext), widgetId,
                    "loading", false);
            if (!RecipeWidgetWorkScheduler.enqueueRefresh(appContext, widgetId)) {
                new RecipeWidgetRepository(appContext).setWidgetState(widgetId, "failed");
                updateWidget(appContext, AppWidgetManager.getInstance(appContext), widgetId, "failed");
            }
            return;
        }
        String entryId = intent.getStringExtra(EXTRA_ENTRY_ID);
        if (!intent.hasExtra(EXTRA_EXPECTED_COMPLETED)) return;
        boolean expectedCompleted = intent.getBooleanExtra(EXTRA_EXPECTED_COMPLETED, false);
        if (!canToggle(appContext, widgetId, entryId, expectedCompleted)) return;
        new RecipeWidgetRepository(appContext).setWidgetState(widgetId, "processing");
        updateWidget(appContext, AppWidgetManager.getInstance(appContext), widgetId, "processing");
        if (!RecipeWidgetWorkScheduler.enqueueAction(appContext, widgetId, entryId, expectedCompleted)) {
            new RecipeWidgetRepository(appContext).setWidgetState(widgetId, "failed");
            updateWidget(appContext, AppWidgetManager.getInstance(appContext), widgetId, "failed");
        }
    }

    /** Refreshes all configured instances after a worker has stored new snapshots. */
    public static void refreshAll(Context context) {
        refresh(context, null);
    }

    /** Redraws one instance, including an instance still completing launcher configuration. */
    public static void refreshWidget(Context context, int widgetId) {
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) return;
        Context appContext = context.getApplicationContext();
        updateWidget(appContext, AppWidgetManager.getInstance(appContext), widgetId, null, true);
    }

    /** Refreshes all instances or only those bound to one refrigerator. */
    public static void refresh(Context context, String fridgeId) {
        Context appContext = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(appContext);
        RecipeWidgetRepository repository = new RecipeWidgetRepository(appContext);
        List<Integer> widgetIds = repository.configuredWidgetIds();
        for (Integer widgetId : widgetIds) {
            if (fridgeId != null) {
                RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
                if (binding == null || !fridgeId.equals(binding.fridgeId)) continue;
            }
            updateWidget(appContext, manager, widgetId, null, false);
        }
    }

    /** Requests a refresh for configured instances bound to the supplied refrigerator. */
    public static void requestRefresh(Context context, String fridgeId) {
        if (fridgeId == null || fridgeId.trim().isEmpty()) return;
        Context appContext = context.getApplicationContext();
        RecipeWidgetRepository repository = new RecipeWidgetRepository(appContext);
        AppWidgetManager manager = AppWidgetManager.getInstance(appContext);
        for (int widgetId : repository.configuredWidgetIds()) {
            RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
            if (binding == null || !fridgeId.equals(binding.fridgeId)) continue;
            repository.setWidgetState(widgetId, "loading");
            updateWidget(appContext, manager, widgetId, "loading", true);
            if (!RecipeWidgetWorkScheduler.enqueueRefresh(appContext, widgetId)) {
                repository.setWidgetState(widgetId, "failed");
                updateWidget(appContext, manager, widgetId, "failed");
            }
        }
    }

    private static void requestRefreshAll(Context context) {
        Context appContext = context.getApplicationContext();
        RecipeWidgetWorkScheduler.cancelConfiguredRefreshChains(appContext);
        RecipeWidgetRepository repository = new RecipeWidgetRepository(appContext);
        AppWidgetManager manager = AppWidgetManager.getInstance(appContext);
        java.util.Set<String> startupFridges = new java.util.HashSet<>();
        for (Integer widgetId : repository.configuredWidgetIds()) {
            RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
            if (binding == null) continue;
            repository.setWidgetState(widgetId, "loading");
            updateWidget(appContext, manager, widgetId, "loading", true);
            if (!startupFridges.add(binding.fridgeId)) continue;
            if (!RecipeWidgetWorkScheduler.enqueueStartupRefresh(appContext, widgetId)) {
                markFridgeRefreshFailed(appContext, manager, repository, binding.fridgeId);
            }
        }
    }

    private static void markFridgeRefreshFailed(Context context, AppWidgetManager manager,
                                                RecipeWidgetRepository repository, String fridgeId) {
        for (Integer widgetId : repository.configuredWidgetIds()) {
            RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
            if (binding == null || !fridgeId.equals(binding.fridgeId)) continue;
            repository.setWidgetState(widgetId, "failed");
            updateWidget(context, manager, widgetId, "failed", true);
        }
    }

    private static synchronized void updateWidget(Context context, AppWidgetManager manager,
                                                  int widgetId, String transientState) {
        updateWidget(context, manager, widgetId, transientState, false);
    }

    private static synchronized void updateWidget(Context context, AppWidgetManager manager,
                                                  int widgetId, String transientState,
                                                  boolean forceFullUpdate) {
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
        RecipeWidgetModels.Snapshot snapshot = binding == null ? null : readSnapshot(repository, binding);
        String persistedState = repository.getWidgetState(widgetId);
        if (transientState == null && binding != null && snapshot == null
                && (persistedState == null || "idle".equals(persistedState))) {
            transientState = "loading";
        }
        int widthDp = widgetWidth(manager, widgetId);
        int heightDp = widgetHeight(manager, widgetId);
        String effectiveState = effectiveState(snapshot == null ? null : snapshot.getStatus(),
                persistedState, transientState);
        RemoteViews views = RecipeWidgetRenderer.render(context, snapshot, widthDp, effectiveState);
        boolean showIngredients = binding == null || binding.showIngredients;
        String renderSignature = renderSignature(snapshot, widthDp, heightDp,
                effectiveState, showIngredients);
        if (!forceFullUpdate && renderSignature.equals(LAST_RENDER_SIGNATURES.get(widgetId))) return;
        String dataSignature = dataSignature(snapshot, widthDp, heightDp, showIngredients);
        boolean dataChanged = !dataSignature.equals(LAST_DATA_SIGNATURES.get(widgetId));
        bindActions(context, views, widgetId);
        bindCollection(context, views, widgetId, snapshot);
        if (shouldUseFullUpdate(forceFullUpdate, dataChanged)) {
            manager.updateAppWidget(widgetId, views);
        } else {
            manager.partiallyUpdateAppWidget(widgetId, views);
        }
        if (dataChanged && snapshot != null && !snapshot.getEntries().isEmpty()) {
            manager.notifyAppWidgetViewDataChanged(widgetId, R.id.widget_page_stack);
        }
        LAST_DATA_SIGNATURES.put(widgetId, dataSignature);
        LAST_RENDER_SIGNATURES.put(widgetId, renderSignature);
    }

    static String dataSignature(RecipeWidgetModels.Snapshot snapshot, int widthDp, int heightDp) {
        return dataSignature(snapshot, widthDp, heightDp, true);
    }

    static String dataSignature(RecipeWidgetModels.Snapshot snapshot, int widthDp, int heightDp,
                                boolean showIngredients) {
        if (snapshot == null) return "none:" + widthDp + ":" + heightDp + "|ingredients="
                + showIngredients;
        StringBuilder value = new StringBuilder().append(widthDp).append('|').append(heightDp).append('|')
                .append("ingredients=").append(showIngredients).append('|')
                .append(snapshot.getFridgeId()).append('|').append(snapshot.getFridgeName()).append('|')
                .append(snapshot.getWeekStart()).append('|').append(snapshot.getStatus());
        for (RecipeWidgetModels.Entry entry : RecipeWidgetRenderer.orderedEntries(snapshot)) {
            value.append('|').append(entry.toJson());
        }
        return value.toString();
    }

    static boolean shouldUseFullUpdate(boolean forceFullUpdate, boolean dataChanged) {
        return forceFullUpdate || dataChanged;
    }

    private static String renderSignature(RecipeWidgetModels.Snapshot snapshot,
                                          int widthDp, int heightDp, String state,
                                          boolean showIngredients) {
        return dataSignature(snapshot, widthDp, heightDp, showIngredients) + "|state="
                + (state == null ? "" : state);
    }

    static String effectiveState(String snapshotState, String persistedState,
                                 String transientState) {
        if (transientState != null && !transientState.isEmpty()) return transientState;
        if (persistedState != null && !persistedState.isEmpty()
                && !"idle".equals(persistedState)) return persistedState;
        return snapshotState == null ? persistedState : snapshotState;
    }

    private static synchronized void forgetRenderState(int widgetId) {
        LAST_RENDER_SIGNATURES.remove(widgetId);
        LAST_DATA_SIGNATURES.remove(widgetId);
    }

    private static RecipeWidgetModels.Snapshot readSnapshot(RecipeWidgetRepository repository,
                                                              RecipeWidgetRepository.WidgetBinding binding) {
        try {
            return repository.getSnapshotModel(repository.getAccountGeneration(), binding.fridgeId,
                    currentWeekStart());
        } catch (RuntimeException exception) {
            Log.w(TAG, "widget snapshot could not be parsed", exception);
            return null;
        }
    }

    private static void bindActions(Context context, RemoteViews views, int widgetId) {
        views.setOnClickPendingIntent(R.id.widget_refresh,
                broadcast(context, ACTION_REFRESH, widgetId, ACTION_CODE_REFRESH));
        Intent open = new Intent(context, MainActivity.class);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context,
                requestCode(widgetId, 9, 0), open, pendingIntentFlags()));
    }

    private static void bindCollection(Context context, RemoteViews views, int widgetId,
                                       RecipeWidgetModels.Snapshot snapshot) {
        if (snapshot == null || snapshot.getEntries().isEmpty()) return;
        Intent service = new Intent(context, RecipeWidgetRemoteViewsService.class)
                .putExtra(EXTRA_WIDGET_ID, widgetId)
                .setData(Uri.parse("fridgeboard://recipe-widget/rows/" + widgetId));
        views.setRemoteAdapter(R.id.widget_page_stack, service);
        Intent action = new Intent(context, RecipeWidgetProvider.class)
                .putExtra(EXTRA_WIDGET_ID, widgetId);
        int mutable = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? PendingIntent.FLAG_MUTABLE : 0;
        PendingIntent template = PendingIntent.getBroadcast(context,
                requestCode(widgetId, 7, 0), action, PendingIntent.FLAG_UPDATE_CURRENT | mutable);
        views.setPendingIntentTemplate(R.id.widget_page_stack, template);
    }

    private static PendingIntent broadcast(Context context, String action, int widgetId,
                                           int actionCode) {
        Intent intent = new Intent(context, RecipeWidgetProvider.class).setAction(action)
                .putExtra(EXTRA_WIDGET_ID, widgetId);
        return PendingIntent.getBroadcast(context, requestCode(widgetId, actionCode, 0), intent,
                pendingIntentFlags());
    }

    private static int requestCode(int widgetId, int actionCode, int slot) {
        return widgetId * 4096 + actionCode * 128 + Math.max(0, slot);
    }

    private static int pendingIntentFlags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }


    private static boolean isWidgetAction(String action) {
        return ACTION_REFRESH.equals(action)
                || ACTION_TOGGLE.equals(action);
    }

    private static boolean isSystemRefreshAction(String action) {
        return Intent.ACTION_BOOT_COMPLETED.equals(action);
    }

    static int widgetHeight(AppWidgetManager manager, int widgetId) {
        Bundle options = manager.getAppWidgetOptions(widgetId);
        if (options == null) return RecipeWidgetRules.DEFAULT_HEIGHT_DP;
        int minHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
        int maxHeight = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 0);
        return RecipeWidgetRules.effectiveHeight(minHeight, maxHeight);
    }

    static int widgetWidth(AppWidgetManager manager, int widgetId) {
        Bundle options = manager.getAppWidgetOptions(widgetId);
        if (options == null) return RecipeWidgetRules.DEFAULT_WIDTH_DP;
        int minWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 0);
        int maxWidth = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 0);
        return RecipeWidgetRules.effectiveWidth(minWidth, maxWidth);
    }

    private static String currentWeekStart() {
        return RecipeWidgetRules.weekStart();
    }

    private static boolean canToggle(Context context, int widgetId, String entryId,
                                     boolean expectedCompleted) {
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
        RecipeWidgetModels.Snapshot snapshot = binding == null ? null : readSnapshot(repository, binding);
        return snapshot != null && canToggleEntry(snapshot.getEntries(), entryId, expectedCompleted);
    }

    static boolean canToggleEntry(List<RecipeWidgetModels.Entry> entries, String entryId,
                                   boolean expectedCompleted) {
        if (entries == null || entryId == null) return false;
        for (RecipeWidgetModels.Entry entry : entries) {
            if (entryId.equals(entry.getId())) {
                return !entry.isPending() && entry.isCompleted() == expectedCompleted;
            }
        }
        return false;
    }
}
