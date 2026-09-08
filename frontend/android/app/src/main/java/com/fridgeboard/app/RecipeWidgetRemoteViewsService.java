package com.fridgeboard.app;

import android.content.Context;
import android.content.Intent;
import android.util.Log;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;

import java.util.Collections;
import java.util.List;

/** Supplies full-height recipe pages to the widget ListView, including vertical swipe support. */
public final class RecipeWidgetRemoteViewsService extends RemoteViewsService {
    private static final String TAG = "RecipeWidgetRemoteViews";

    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        int widgetId = intent == null ? -1
                : intent.getIntExtra(RecipeWidgetProvider.EXTRA_WIDGET_ID, -1);
        return new Factory(getApplicationContext(), widgetId);
    }

    private static final class Factory implements RemoteViewsFactory {
        private final Context context;
        private final int widgetId;
        private List<RecipeWidgetModels.Entry> entries = Collections.emptyList();
        private RecipeWidgetModels.Snapshot snapshot;
        private int widthDp;
        private int heightDp;

        Factory(Context context, int widgetId) {
            this.context = context;
            this.widgetId = widgetId;
        }

        @Override
        public void onCreate() {
            reload();
        }

        @Override
        public void onDataSetChanged() {
            reload();
        }

        @Override
        public void onDestroy() {
            entries = Collections.emptyList();
            snapshot = null;
        }

        @Override
        public int getCount() {
            int count = snapshot == null || entries.isEmpty()
                    ? 0 : RecipeWidgetRules.pageCount(entries, widthDp, heightDp);
            return count;
        }

        @Override
        public RemoteViews getViewAt(int position) {
            if (snapshot == null || position < 0 || position >= getCount()) return null;
            RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
            RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
            String state = binding == null ? "idle" : repository.getWidgetState(widgetId);
            return RecipeWidgetRenderer.renderPage(context, widgetId, snapshot, position,
                    widthDp, heightDp, state);
        }

        @Override
        public RemoteViews getLoadingView() {
            return null;
        }

        @Override
        public int getViewTypeCount() {
            return 1;
        }

        @Override
        public long getItemId(int position) {
            return position;
        }

        @Override
        public boolean hasStableIds() {
            return false;
        }

        private void reload() {
            try {
                RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
                RecipeWidgetRepository.WidgetBinding binding = repository.getWidgetBinding(widgetId);
                if (binding == null) {
                    snapshot = null;
                    entries = Collections.emptyList();
                    heightDp = 0;
                    return;
                }
                heightDp = widgetHeight();
                widthDp = widgetWidth();
                snapshot = repository.getSnapshotModel(repository.getAccountGeneration(), binding.fridgeId,
                        RecipeWidgetRules.weekStart());
                entries = RecipeWidgetRenderer.orderedEntries(snapshot);
            } catch (RuntimeException exception) {
                Log.w(TAG, "widget snapshot reload failed", exception);
                snapshot = null;
                entries = Collections.emptyList();
                heightDp = 0;
                widthDp = 0;
            }
        }

        private int widgetHeight() {
            android.appwidget.AppWidgetManager manager =
                    android.appwidget.AppWidgetManager.getInstance(context);
            return RecipeWidgetProvider.widgetHeight(manager, widgetId);
        }

        private int widgetWidth() {
            android.appwidget.AppWidgetManager manager =
                    android.appwidget.AppWidgetManager.getInstance(context);
            return RecipeWidgetProvider.widgetWidth(manager, widgetId);
        }
    }
}
