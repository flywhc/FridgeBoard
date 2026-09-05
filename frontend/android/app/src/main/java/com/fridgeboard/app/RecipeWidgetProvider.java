package com.fridgeboard.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetProvider;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import android.widget.RemoteViews;

import java.util.List;

/** Receives widget lifecycle and button broadcasts and delegates data work to the repository/worker. */
public final class RecipeWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_PREVIOUS = "com.fridgeboard.app.widget.PREVIOUS";
    public static final String ACTION_NEXT = "com.fridgeboard.app.widget.NEXT";
    public static final String ACTION_REFRESH = "com.fridgeboard.app.widget.REFRESH";
    public static final String ACTION_TOGGLE = "com.fridgeboard.app.widget.TOGGLE";
    public static final String EXTRA_WIDGET_ID = AppWidgetManager.EXTRA_APPWIDGET_ID;
    public static final String EXTRA_SLOT = "slot";
    public static final String EXTRA_ENTRY_ID = "entry_id";
    private static final String TAG = "RecipeWidget";
    private static final int ACTION_CODE_PREVIOUS = 1;
    private static final int ACTION_CODE_NEXT = 2;
    private static final int ACTION_CODE_REFRESH = 3;
    private static final int ACTION_CODE_TOGGLE = 4;

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
        for (int widgetId : widgetIds) updateWidget(context, manager, widgetId, null);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager,
                                          int widgetId, Bundle newOptions) {
        updateWidget(context, manager, widgetId, null);
    }

    @Override
    public void onDeleted(Context context, int[] widgetIds) {
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        for (int widgetId : widgetIds) repository.removeWidget(widgetId);
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
        if (ACTION_PREVIOUS.equals(action) || ACTION_NEXT.equals(action)) {
            updatePage(appContext, widgetId, ACTION_NEXT.equals(action));
            return;
        }
        if (ACTION_REFRESH.equals(action)) {
            new RecipeWidgetRepository(appContext).setWidgetState(widgetId, "loading");
            updateWidget(appContext, AppWidgetManager.getInstance(appContext), widgetId, "loading");
            RecipeWidgetWorkScheduler.enqueueRefresh(appContext, widgetId);
            return;
        }
        int slot = intent.getIntExtra(EXTRA_SLOT, -1);
        String entryId = intent.getStringExtra(EXTRA_ENTRY_ID);
        Boolean expectedCompleted = expectedCompleted(appContext, widgetId, slot);
        if (entryId == null || expectedCompleted == null) return;
        new RecipeWidgetRepository(appContext).setWidgetState(widgetId, "processing");
        updateWidget(appContext, AppWidgetManager.getInstance(appContext), widgetId, "processing");
        RecipeWidgetWorkScheduler.enqueueAction(appContext, widgetId, entryId, expectedCompleted);
    }

    /** Refreshes all configured instances after a worker has stored new snapshots. */
    public static void refreshAll(Context context) {
        Context appContext = context.getApplicationContext();
        AppWidgetManager manager = AppWidgetManager.getInstance(appContext);
        ComponentName provider = new ComponentName(appContext, RecipeWidgetProvider.class);
        int[] widgetIds = manager.getAppWidgetIds(provider);
        for (int widgetId : widgetIds) updateWidget(appContext, manager, widgetId, null);
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
            updateWidget(appContext, manager, widgetId, "loading");
            RecipeWidgetWorkScheduler.enqueueRefresh(appContext, widgetId);
        }
    }

    private static void requestRefreshAll(Context context) {
        Context appContext = context.getApplicationContext();
        RecipeWidgetRepository repository = new RecipeWidgetRepository(appContext);
        AppWidgetManager manager = AppWidgetManager.getInstance(appContext);
        for (Integer widgetId : repository.configuredWidgetIds()) {
            if (repository.getWidgetBinding(widgetId) == null) continue;
            repository.setWidgetState(widgetId, "loading");
            updateWidget(appContext, manager, widgetId, "loading");
            RecipeWidgetWorkScheduler.enqueueRefresh(appContext, widgetId);
        }
    }

    private static void updatePage(Context context, int widgetId, boolean next) {
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
        if (binding == null) {
            updateWidget(context, AppWidgetManager.getInstance(context), widgetId, null);
            return;
        }
        RecipeWidgetModels.Snapshot snapshot = readSnapshot(repository, binding);
        int heightDp = widgetHeight(AppWidgetManager.getInstance(context), widgetId);
        int pages = RecipeWidgetRules.pageCount(snapshot == null ? 0
                : RecipeWidgetRules.sortAndFlatten(snapshot.getEntries()).size(), heightDp);
        int page = RecipeWidgetRules.clampPage(binding.pageIndex + (next ? 1 : -1), pages);
        repository.setPageIndex(widgetId, page);
        updateWidget(context, AppWidgetManager.getInstance(context), widgetId, null);
    }

    private static void updateWidget(Context context, AppWidgetManager manager, int widgetId,
                                     String transientState) {
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
        RecipeWidgetModels.Snapshot snapshot = binding == null ? null : readSnapshot(repository, binding);
        if (transientState == null) transientState = repository.getWidgetState(widgetId);
        if (transientState == null && binding != null && snapshot == null) transientState = "loading";
        if (binding != null && snapshot == null && "idle".equals(transientState)) transientState = "loading";
        int heightDp = widgetHeight(manager, widgetId);
        int pageIndex = binding == null ? 0 : binding.pageIndex;
        if (binding != null && snapshot != null) {
            int pages = RecipeWidgetRules.pageCount(
                    RecipeWidgetRenderer.orderedEntries(snapshot).size(), heightDp);
            int clampedPage = RecipeWidgetRules.clampPage(pageIndex, pages);
            if (clampedPage != pageIndex) repository.setPageIndex(widgetId, clampedPage);
            pageIndex = clampedPage;
        }
        RemoteViews views = RecipeWidgetRenderer.render(context, widgetId, snapshot,
                pageIndex, heightDp, transientState);
        bindActions(context, views, widgetId, snapshot, pageIndex, heightDp);
        manager.updateAppWidget(widgetId, views);
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

    private static void bindActions(Context context, RemoteViews views, int widgetId,
                                    RecipeWidgetModels.Snapshot snapshot, int page, int heightDp) {
        views.setOnClickPendingIntent(R.id.widget_previous,
                broadcast(context, ACTION_PREVIOUS, widgetId, -1, null, ACTION_CODE_PREVIOUS));
        views.setOnClickPendingIntent(R.id.widget_next,
                broadcast(context, ACTION_NEXT, widgetId, -1, null, ACTION_CODE_NEXT));
        views.setOnClickPendingIntent(R.id.widget_refresh,
                broadcast(context, ACTION_REFRESH, widgetId, -1, null, ACTION_CODE_REFRESH));
        List<RecipeWidgetModels.Entry> entries = snapshot == null ? java.util.Collections.emptyList()
                : RecipeWidgetRenderer.orderedEntries(snapshot);
        int slots = RecipeWidgetRenderer.slotCount(heightDp);
        int start = page * slots;
        for (int slot = 0; slot < RecipeWidgetRenderer.MAX_SLOTS; slot++) {
            String entryId = null;
            int index = start + slot;
            if (index >= 0 && index < entries.size()) entryId = entries.get(index).getId();
            views.setOnClickPendingIntent(toggleId(slot),
                    broadcast(context, ACTION_TOGGLE, widgetId, slot, entryId,
                            ACTION_CODE_TOGGLE + slot));
        }
        Intent open = new Intent(context, MainActivity.class);
        views.setOnClickPendingIntent(R.id.widget_root, PendingIntent.getActivity(context,
                requestCode(widgetId, 9, 0), open, pendingIntentFlags()));
    }

    private static PendingIntent broadcast(Context context, String action, int widgetId,
                                           int slot, String entryId, int actionCode) {
        Intent intent = new Intent(context, RecipeWidgetProvider.class).setAction(action)
                .putExtra(EXTRA_WIDGET_ID, widgetId);
        if (slot >= 0) intent.putExtra(EXTRA_SLOT, slot);
        if (entryId != null) intent.putExtra(EXTRA_ENTRY_ID, entryId);
        return PendingIntent.getBroadcast(context, requestCode(widgetId, actionCode, slot), intent,
                pendingIntentFlags());
    }

    private static int requestCode(int widgetId, int actionCode, int slot) {
        return widgetId * 32 + actionCode * 4 + Math.max(0, slot);
    }

    private static int pendingIntentFlags() {
        return PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
    }

    private static int toggleId(int slot) {
        return new int[]{R.id.widget_row_1_toggle, R.id.widget_row_2_toggle,
                R.id.widget_row_3_toggle}[slot];
    }

    private static boolean isWidgetAction(String action) {
        return ACTION_PREVIOUS.equals(action) || ACTION_NEXT.equals(action)
                || ACTION_REFRESH.equals(action) || ACTION_TOGGLE.equals(action);
    }

    private static boolean isSystemRefreshAction(String action) {
        return AppWidgetManager.ACTION_APPWIDGET_UPDATE.equals(action)
                || Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_DATE_CHANGED.equals(action)
                || Intent.ACTION_TIMEZONE_CHANGED.equals(action)
                || Intent.ACTION_TIME_CHANGED.equals(action);
    }

    private static int widgetHeight(AppWidgetManager manager, int widgetId) {
        Bundle options = manager.getAppWidgetOptions(widgetId);
        return options == null ? RecipeWidgetRenderer.HEIGHT_MEDIUM_DP
                : options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT,
                RecipeWidgetRenderer.HEIGHT_MEDIUM_DP);
    }

    private static String currentWeekStart() {
        return RecipeWidgetRules.weekStart();
    }

    private static Boolean expectedCompleted(Context context, int widgetId, int slot) {
        if (slot < 0 || slot >= RecipeWidgetRenderer.MAX_SLOTS) return null;
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
        RecipeWidgetModels.Snapshot snapshot = binding == null ? null : readSnapshot(repository, binding);
        if (snapshot == null) return null;
        int index = binding.pageIndex * RecipeWidgetRules.rowsForHeight(
                widgetHeight(AppWidgetManager.getInstance(context), widgetId)) + slot;
        List<RecipeWidgetModels.Entry> entries = RecipeWidgetRules.sortAndFlatten(snapshot.getEntries());
        return index >= 0 && index < entries.size() ? entries.get(index).isCompleted() : null;
    }
}
