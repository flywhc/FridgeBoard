package com.fridgeboard.app;

import android.content.Context;
import android.content.Intent;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Collections;
import java.util.List;

/** Builds the outer widget and its static page RemoteViews. */
public final class RecipeWidgetRenderer {
    static final int MAX_SLOTS = 3;
    static final int MAX_PAGE_DOTS = 7;
    static final int HEIGHT_MEDIUM_DP = 220;
    private static final int[] ROW_IDS = {R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3};
    private static final int[] DAY_TEXT_IDS = {R.id.widget_row_1_day, R.id.widget_row_2_day, R.id.widget_row_3_day};
    private static final int[] RECIPE_TEXT_IDS = {R.id.widget_row_1_recipe, R.id.widget_row_2_recipe, R.id.widget_row_3_recipe};
    private static final int[] INGREDIENT_TEXT_IDS = {R.id.widget_row_1_ingredients, R.id.widget_row_2_ingredients, R.id.widget_row_3_ingredients};
    private static final int[] TOGGLE_IDS = {R.id.widget_row_1_toggle, R.id.widget_row_2_toggle, R.id.widget_row_3_toggle};
    private static final int[] PAGE_DOT_IDS = {
            R.id.widget_page_dot_1, R.id.widget_page_dot_2, R.id.widget_page_dot_3,
            R.id.widget_page_dot_4, R.id.widget_page_dot_5, R.id.widget_page_dot_6,
            R.id.widget_page_dot_7
    };

    private RecipeWidgetRenderer() {
    }

    /** Renders the fixed outer shell and the selected static page. */
    public static RemoteViews render(Context context, int widgetId,
                                     RecipeWidgetModels.Snapshot snapshot, int pageIndex,
                                     int heightDp, String state) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.recipe_widget);
        views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_title));
        views.setViewVisibility(R.id.widget_page_content, View.VISIBLE);
        views.setViewVisibility(R.id.widget_page_stack, View.VISIBLE);
        views.setViewVisibility(R.id.widget_empty, snapshot == null ? View.VISIBLE : View.GONE);
        if (snapshot == null) {
            int message = "loading".equals(state) ? R.string.widget_loading
                    : "auth_expired".equals(state) ? R.string.widget_auth_expired
                    : "offline".equals(state) ? R.string.widget_offline_no_cache
                    : "failed".equals(state) ? R.string.widget_failed : R.string.widget_no_config;
            views.setTextViewText(R.id.widget_status, context.getString(message));
            views.setTextColor(R.id.widget_status, context.getColor(
                    "auth_expired".equals(state) || "offline".equals(state) || "failed".equals(state)
                            ? R.color.widget_danger : R.color.widget_muted));
            views.setViewVisibility(R.id.widget_page_content, View.VISIBLE);
            views.setViewVisibility(R.id.widget_page_stack, View.GONE);
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setViewVisibility(R.id.widget_status, View.GONE);
            views.setTextViewText(R.id.widget_empty, context.getString(message));
            hideFooterProgress(views);
            views.setViewVisibility(R.id.widget_footer, View.GONE);
            return views;
        }
        views.setViewVisibility(R.id.widget_footer, View.VISIBLE);
        String effectiveState = state == null || state.isEmpty() ? snapshot.getStatus() : state;
        views.setViewVisibility(R.id.widget_status, View.VISIBLE);
        renderStatus(context, views, snapshot, effectiveState);
        List<RecipeWidgetModels.Entry> entries = orderedEntries(snapshot);
        if (entries.isEmpty()) {
            views.setViewVisibility(R.id.widget_page_content, View.VISIBLE);
            views.setViewVisibility(R.id.widget_page_stack, View.GONE);
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setTextViewText(R.id.widget_empty, statusText(context, effectiveState));
        } else {
            views.setViewVisibility(R.id.widget_empty, View.GONE);
        }
        RecipeWidgetRules.CompletionStats stats = RecipeWidgetRules.completionStats(entries);
        views.setTextViewText(R.id.widget_progress_label, context.getString(
                R.string.widget_week_progress, stats.getCompleted(), stats.getTotal()));
        views.setProgressBar(R.id.widget_progress, 100,
                stats.getTotal() == 0 ? 0 : stats.getCompleted() * 100 / stats.getTotal(), false);
        return views;
    }

    /** Renders one fixed-height page, including its page dots and collection fill-in intents. */
    public static RemoteViews renderPage(Context context, int widgetId,
                                         RecipeWidgetModels.Snapshot snapshot, int pageIndex,
                                         int heightDp, String state) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.recipe_widget_page);
        int contentHeightDp = RecipeWidgetRules.pageContentHeight(heightDp);
        int contentHeightPx = Math.round(contentHeightDp
                * context.getResources().getDisplayMetrics().density);
        views.setInt(R.id.widget_page_root, "setMinimumHeight", contentHeightPx);
        int rowTopDp = RecipeWidgetRules.pageRowTopPadding(heightDp);
        int densityRowTop = Math.round(rowTopDp
                * context.getResources().getDisplayMetrics().density);
        views.setViewPadding(R.id.widget_page_rows, 0, densityRowTop, 0, 0);
        renderPageContent(context, views, widgetId, snapshot, pageIndex, heightDp, state, false);
        return views;
    }

    private static void renderPageContent(Context context, RemoteViews views, int widgetId,
                                          RecipeWidgetModels.Snapshot snapshot, int pageIndex,
                                          int heightDp, String state, boolean directActions) {
        List<RecipeWidgetModels.Entry> entries = orderedEntries(snapshot);
        int rows = RecipeWidgetRules.rowsForHeight(heightDp);
        int pages = RecipeWidgetRules.pageCount(entries, heightDp);
        int page = RecipeWidgetRules.clampPage(pageIndex, pages);
        for (int slot = 0; slot < MAX_SLOTS; slot++) {
            clearRow(views, slot);
            views.setViewVisibility(INGREDIENT_TEXT_IDS[slot], heightDp < HEIGHT_MEDIUM_DP
                    ? View.GONE : View.VISIBLE);
        }
        int start = page * rows;
        for (int slot = 0; slot < rows; slot++) {
            int index = start + slot;
            if (index < entries.size()) {
                fillRow(context, views, widgetId, slot, entries.get(index), page, state,
                        directActions);
            }
        }
        setPageDots(context, views, widgetId, page, pages, heightDp, directActions);
    }

    /** Returns the visible row count dictated by widget height. */
    public static int slotCount(int heightDp) {
        return RecipeWidgetRules.rowsForHeight(heightDp);
    }

    /** Returns the number of pages for a number of entries and visible slots. */
    public static int pageCount(int entryCount, int slots) {
        return RecipeWidgetRules.pageCount(entryCount, Math.max(1, slots));
    }

    private static void clearRow(RemoteViews views, int slot) {
        views.setTextViewText(DAY_TEXT_IDS[slot], "");
        views.setTextViewText(RECIPE_TEXT_IDS[slot], "");
        views.setTextViewText(INGREDIENT_TEXT_IDS[slot], "");
        views.setViewVisibility(ROW_IDS[slot], View.GONE);
    }

    private static void fillRow(Context context, RemoteViews views, int widgetId, int slot,
                                RecipeWidgetModels.Entry entry, int page, String state,
                                boolean directActions) {
        views.setViewVisibility(ROW_IDS[slot], View.VISIBLE);
        views.setTextViewText(DAY_TEXT_IDS[slot], entry.getLabel());
        SpannableString dish = new SpannableString(entry.isPending()
                ? entry.getDishName() + "（处理中）" : entry.isCompleted()
                ? entry.getDishName() + "（已完成）" : entry.getDishName());
        if (entry.isCompleted()) dish.setSpan(new StrikethroughSpan(), 0, dish.length(),
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        views.setTextViewText(RECIPE_TEXT_IDS[slot], dish);
        views.setTextColor(RECIPE_TEXT_IDS[slot], context.getColor(entry.isCompleted()
                ? R.color.widget_done : R.color.widget_ink));
        views.setTextViewText(INGREDIENT_TEXT_IDS[slot], ingredientText(entry));
        views.setTextColor(INGREDIENT_TEXT_IDS[slot], context.getColor(entry.getMissingCount() > 0
                ? R.color.widget_danger : R.color.widget_muted));
        views.setImageViewResource(TOGGLE_IDS[slot], entry.isCompleted()
                ? R.drawable.widget_pot_done : R.drawable.widget_pot);
        views.setContentDescription(TOGGLE_IDS[slot], context.getString(entry.isCompleted()
                ? R.string.widget_undo_recipe : R.string.widget_complete_recipe, entry.getDishName()));
        views.setBoolean(TOGGLE_IDS[slot], "setEnabled",
                !entry.isPending() && !"processing".equals(state));
        Intent fillIn = new Intent(RecipeWidgetProvider.ACTION_TOGGLE)
                .putExtra(RecipeWidgetProvider.EXTRA_SLOT, slot)
                .putExtra(RecipeWidgetProvider.EXTRA_PAGE, page)
                .putExtra(RecipeWidgetProvider.EXTRA_ENTRY_ID, entry.getId());
        if (directActions) {
            views.setOnClickPendingIntent(TOGGLE_IDS[slot], PendingIntentFactory.toggle(
                    context, widgetId, slot, page, entry.getId()));
        } else {
            views.setOnClickFillInIntent(TOGGLE_IDS[slot], fillIn);
        }
    }

    private static String ingredientText(RecipeWidgetModels.Entry entry) {
        if (entry.getIngredientsDisplay().isEmpty()) return "";
        String text = RecipeWidgetRules.formatIngredients(entry.getIngredientsDisplay(), 80);
        String missing = RecipeWidgetRules.formatMissingCount(entry.getMissingCount());
        return missing.isEmpty() ? text : text + " · " + missing;
    }

    private static void renderStatus(Context context, RemoteViews views,
                                     RecipeWidgetModels.Snapshot snapshot, String state) {
        int color = R.color.widget_muted;
        String text;
        switch (state) {
            case "loading": text = context.getString(R.string.widget_loading); break;
            case "offline": text = context.getString(R.string.widget_offline, snapshot.getFridgeName()); break;
            case "failed": text = context.getString(R.string.widget_failed); color = R.color.widget_danger; break;
            case "auth_expired":
            case "unauthorized": text = context.getString(R.string.widget_auth_expired); color = R.color.widget_danger; break;
            case "processing": text = context.getString(R.string.widget_processing); break;
            case "empty": text = context.getString(R.string.widget_empty_week); break;
            default: text = snapshot.getFridgeName();
        }
        views.setTextViewText(R.id.widget_status, text);
        views.setTextColor(R.id.widget_status, context.getColor(color));
    }

    private static String statusText(Context context, String state) {
        if ("loading".equals(state) || "processing".equals(state)) {
            return context.getString("loading".equals(state) ? R.string.widget_loading : R.string.widget_processing);
        }
        if ("failed".equals(state)) return context.getString(R.string.widget_failed);
        if ("auth_expired".equals(state) || "unauthorized".equals(state)) return context.getString(R.string.widget_auth_expired);
        return context.getString(R.string.widget_empty_week);
    }

    private static void hideFooterProgress(RemoteViews views) {
        views.setTextViewText(R.id.widget_progress_label, "");
        views.setProgressBar(R.id.widget_progress, 100, 0, false);
    }

    private static void setPageDots(Context context, RemoteViews views, int widgetId, int page,
                                    int pages, int heightDp, boolean directActions) {
        int count = Math.min(MAX_PAGE_DOTS, Math.max(1, pages));
        int start = RecipeWidgetRules.pageDotStart(page, pages, MAX_PAGE_DOTS);
        int dotTopDp = RecipeWidgetRules.pageDotTopPadding(heightDp, pages, MAX_PAGE_DOTS);
        int dotTopPx = Math.round(dotTopDp
                * context.getResources().getDisplayMetrics().density);
        views.setViewPadding(R.id.widget_page_dots, 0, dotTopPx, 0, 0);
        views.setViewVisibility(R.id.widget_page_dots, pages > 1 ? View.VISIBLE : View.GONE);
        for (int index = 0; index < PAGE_DOT_IDS.length; index++) {
            boolean visible = index < count;
            views.setViewVisibility(PAGE_DOT_IDS[index], visible ? View.VISIBLE : View.GONE);
            if (!visible) continue;
            int targetPage = start + index;
            views.setImageViewResource(PAGE_DOT_IDS[index], targetPage == page
                    ? R.drawable.widget_page_dot_active : R.drawable.widget_page_dot);
            views.setContentDescription(PAGE_DOT_IDS[index], targetPage == page
                    ? "第 " + (targetPage + 1) + " 页，当前页" : "切换到第 " + (targetPage + 1) + " 页");
            Intent fillIn = new Intent(RecipeWidgetProvider.ACTION_PAGE)
                    .putExtra(RecipeWidgetProvider.EXTRA_PAGE, targetPage);
            if (directActions) {
                views.setOnClickPendingIntent(PAGE_DOT_IDS[index], PendingIntentFactory.page(
                        context, widgetId, targetPage));
            } else {
                views.setOnClickFillInIntent(PAGE_DOT_IDS[index], fillIn);
            }
        }
    }

    private static final class PendingIntentFactory {
        private PendingIntentFactory() {}

        static android.app.PendingIntent page(Context context, int widgetId, int page) {
            Intent intent = new Intent(context, RecipeWidgetProvider.class)
                    .setAction(RecipeWidgetProvider.ACTION_PAGE)
                    .putExtra(RecipeWidgetProvider.EXTRA_WIDGET_ID, widgetId)
                    .putExtra(RecipeWidgetProvider.EXTRA_PAGE, page);
            return android.app.PendingIntent.getBroadcast(context,
                    widgetId * 4096 + 4 * 128 + page, intent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT
                            | android.app.PendingIntent.FLAG_IMMUTABLE);
        }

        static android.app.PendingIntent toggle(Context context, int widgetId, int slot, int page,
                                                String entryId) {
            Intent intent = new Intent(context, RecipeWidgetProvider.class)
                    .setAction(RecipeWidgetProvider.ACTION_TOGGLE)
                    .putExtra(RecipeWidgetProvider.EXTRA_WIDGET_ID, widgetId)
                    .putExtra(RecipeWidgetProvider.EXTRA_SLOT, slot)
                    .putExtra(RecipeWidgetProvider.EXTRA_PAGE, page)
                    .putExtra(RecipeWidgetProvider.EXTRA_ENTRY_ID, entryId);
            return android.app.PendingIntent.getBroadcast(context,
                    widgetId * 4096 + 5 * 128 + slot, intent,
                    android.app.PendingIntent.FLAG_UPDATE_CURRENT
                            | android.app.PendingIntent.FLAG_IMMUTABLE);
        }
    }

    static List<RecipeWidgetModels.Entry> orderedEntries(RecipeWidgetModels.Snapshot snapshot) {
        return snapshot == null ? Collections.emptyList() : RecipeWidgetRules.sortAndFlatten(snapshot.getEntries());
    }
}
