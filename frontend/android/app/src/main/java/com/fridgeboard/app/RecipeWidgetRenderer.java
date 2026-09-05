package com.fridgeboard.app;

import android.content.Context;
import android.graphics.Color;
import android.text.SpannableString;
import android.text.Spanned;
import android.text.style.StrikethroughSpan;
import android.view.View;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Builds the static RemoteViews tree used by every recipe widget instance. */
public final class RecipeWidgetRenderer {
    static final int MAX_SLOTS = 3;
    static final int HEIGHT_MEDIUM_DP = 220;

    private static final int[] ROW_IDS = {
            R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3
    };
    private static final int[] DAY_TEXT_IDS = {
            R.id.widget_row_1_day, R.id.widget_row_2_day, R.id.widget_row_3_day
    };
    private static final int[] DATE_TEXT_IDS = {
            R.id.widget_row_1_date, R.id.widget_row_2_date, R.id.widget_row_3_date
    };
    private static final int[] RECIPE_TEXT_IDS = {
            R.id.widget_row_1_recipe, R.id.widget_row_2_recipe, R.id.widget_row_3_recipe
    };
    private static final int[] INGREDIENT_TEXT_IDS = {
            R.id.widget_row_1_ingredients, R.id.widget_row_2_ingredients, R.id.widget_row_3_ingredients
    };
    private static final int[] TOGGLE_IDS = {
            R.id.widget_row_1_toggle, R.id.widget_row_2_toggle, R.id.widget_row_3_toggle
    };

    private RecipeWidgetRenderer() {
    }

    /**
     * Renders a snapshot into the fixed three-row layout.
     *
     * @param context application context used to resolve strings and colors
     * @param widgetId instance id, used for per-slot click intents
     * @param snapshot cached or freshly fetched snapshot; may be {@code null}
     * @param pageIndex zero-based page index
     * @param heightDp current host-provided widget height in dp
     * @param state optional transient state such as loading or processing
     * @return a new RemoteViews instance
     */
    public static RemoteViews render(Context context, int widgetId,
                                     RecipeWidgetModels.Snapshot snapshot, int pageIndex,
                                     int heightDp, String state) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.recipe_widget);
        int slotCount = RecipeWidgetRules.rowsForHeight(heightDp);
        List<RecipeWidgetModels.Entry> entries = orderedEntries(snapshot);
        int pageCount = RecipeWidgetRules.pageCount(entries, heightDp);
        int page = RecipeWidgetRules.clampPage(pageIndex, pageCount);

        views.setTextViewText(R.id.widget_title, context.getString(R.string.widget_title));
        views.setViewVisibility(R.id.widget_status, heightDp < HEIGHT_MEDIUM_DP ? View.GONE : View.VISIBLE);
        views.setViewVisibility(R.id.widget_empty, View.GONE);
        for (int slot = 0; slot < MAX_SLOTS; slot++) {
            clearRow(views, slot);
            views.setViewVisibility(ROW_IDS[slot], slot < slotCount ? View.VISIBLE : View.GONE);
            views.setViewVisibility(INGREDIENT_TEXT_IDS[slot],
                    heightDp < HEIGHT_MEDIUM_DP ? View.GONE : View.VISIBLE);
            views.setViewVisibility(DATE_TEXT_IDS[slot],
                    heightDp < HEIGHT_MEDIUM_DP ? View.GONE : View.VISIBLE);
        }

        if (snapshot == null) {
            views.setViewVisibility(R.id.widget_status, View.VISIBLE);
            int message = "loading".equals(state) ? R.string.widget_loading
                    : "auth_expired".equals(state) ? R.string.widget_auth_expired
                    : "failed".equals(state) ? R.string.widget_failed : R.string.widget_no_config;
            views.setTextViewText(R.id.widget_status, context.getString(message));
            views.setTextColor(R.id.widget_status, context.getColor(
                    "auth_expired".equals(state) || "failed".equals(state)
                            ? R.color.widget_danger : R.color.widget_muted));
            hideFooterProgress(views);
            setNavigation(views, page, 1);
            return views;
        }

        String effectiveState = state == null || state.isEmpty() ? snapshot.getStatus() : state;
        renderStatus(context, views, snapshot, effectiveState);
        if (entries.isEmpty()) {
            views.setViewVisibility(R.id.widget_empty, View.VISIBLE);
            views.setTextViewText(R.id.widget_empty, statusText(context, effectiveState));
        } else {
            int start = page * slotCount;
            for (int slot = 0; slot < slotCount; slot++) {
                int index = start + slot;
                if (index < entries.size()) fillRow(views, slot, entries.get(index), snapshot.getWeekStart(), effectiveState);
                else views.setViewVisibility(ROW_IDS[slot], View.GONE);
            }
        }
        setNavigation(views, page, pageCount);
        RecipeWidgetRules.CompletionStats stats = RecipeWidgetRules.completionStats(entries);
        views.setTextViewText(R.id.widget_progress_label, context.getString(
                R.string.widget_week_progress, stats.getCompleted(), stats.getTotal()));
        views.setProgressBar(R.id.widget_progress, 100,
                stats.getTotal() == 0 ? 0 : stats.getCompleted() * 100 / stats.getTotal(), false);
        return views;
    }

    /** Returns the slot count dictated by the host-provided height contract. */
    public static int slotCount(int heightDp) {
        return RecipeWidgetRules.rowsForHeight(heightDp);
    }

    /** Returns the number of pages for a number of entries and visible slots. */
    public static int pageCount(int entryCount, int slots) {
        return RecipeWidgetRules.pageCount(entryCount, Math.max(1, slots));
    }

    private static void clearRow(RemoteViews views, int slot) {
        views.setTextViewText(DAY_TEXT_IDS[slot], "");
        views.setTextViewText(DATE_TEXT_IDS[slot], "");
        views.setTextViewText(RECIPE_TEXT_IDS[slot], "");
        views.setTextViewText(INGREDIENT_TEXT_IDS[slot], "");
        views.setViewVisibility(ROW_IDS[slot], View.GONE);
    }

    private static void fillRow(RemoteViews views, int slot, RecipeWidgetModels.Entry entry,
                                String weekStart, String state) {
        views.setViewVisibility(ROW_IDS[slot], View.VISIBLE);
        views.setTextViewText(DAY_TEXT_IDS[slot], entry.getLabel());
        views.setTextViewText(DATE_TEXT_IDS[slot], dateForWeekday(weekStart, entry.getWeekday()));
        SpannableString dish = new SpannableString(entry.isPending()
                ? entry.getDishName() + "（处理中）" : entry.isCompleted()
                ? "✓ " + entry.getDishName() + "（已完成）" : entry.getDishName());
        if (entry.isCompleted()) {
            dish.setSpan(new StrikethroughSpan(), 2, dish.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        }
        views.setTextViewText(RECIPE_TEXT_IDS[slot], dish);
        views.setTextColor(RECIPE_TEXT_IDS[slot], Color.parseColor(entry.isCompleted()
                ? "#52705A" : "#6D4E36"));
        views.setTextViewText(INGREDIENT_TEXT_IDS[slot], ingredientText(entry));
        views.setTextColor(INGREDIENT_TEXT_IDS[slot], Color.parseColor(
                entry.getMissingCount() > 0 ? "#9A3F32" : "#927A66"));
        views.setImageViewResource(TOGGLE_IDS[slot], entry.isCompleted()
                ? R.drawable.widget_check : R.drawable.widget_pot);
        views.setBoolean(TOGGLE_IDS[slot], "setEnabled",
                !entry.isPending() && !"processing".equals(state));
        views.setContentDescription(TOGGLE_IDS[slot], entry.isCompleted()
                ? (entry.isPending() ? "处理中" : "撤销完成")
                : (entry.isPending() ? "处理中" : "完成食谱"));
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
            case "loading":
                text = context.getString(R.string.widget_loading);
                break;
            case "offline":
                text = context.getString(R.string.widget_offline, snapshot.getFridgeName());
                break;
            case "failed":
                text = context.getString(R.string.widget_failed);
                color = R.color.widget_danger;
                break;
            case "auth_expired":
            case "unauthorized":
                text = context.getString(R.string.widget_auth_expired);
                color = R.color.widget_danger;
                break;
            case "processing":
                text = context.getString(R.string.widget_processing);
                break;
            case "empty":
                text = context.getString(R.string.widget_empty_week);
                break;
            default:
                text = snapshot.getFridgeName();
                break;
        }
        views.setTextViewText(R.id.widget_status, text);
        views.setTextColor(R.id.widget_status, context.getColor(color));
    }

    private static String statusText(Context context, String state) {
        if ("loading".equals(state) || "processing".equals(state)) {
            return context.getString("loading".equals(state)
                    ? R.string.widget_loading : R.string.widget_processing);
        }
        if ("failed".equals(state)) return context.getString(R.string.widget_failed);
        if ("auth_expired".equals(state) || "unauthorized".equals(state)) {
            return context.getString(R.string.widget_auth_expired);
        }
        return context.getString(R.string.widget_empty_week);
    }

    private static void hideFooterProgress(RemoteViews views) {
        views.setTextViewText(R.id.widget_progress_label, "");
        views.setProgressBar(R.id.widget_progress, 100, 0, false);
    }

    private static void setNavigation(RemoteViews views, int page, int pages) {
        views.setTextViewText(R.id.widget_page, "第 " + (page + 1) + "/" + pages + " 页");
        views.setBoolean(R.id.widget_previous, "setEnabled", page > 0);
        views.setBoolean(R.id.widget_next, "setEnabled", page + 1 < pages);
    }

    static List<RecipeWidgetModels.Entry> orderedEntries(
            RecipeWidgetModels.Snapshot snapshot) {
        return snapshot == null ? Collections.emptyList()
                : RecipeWidgetRules.sortAndFlatten(snapshot.getEntries());
    }

    private static String dateForWeekday(String weekStart, int weekday) {
        try {
            SimpleDateFormat parser = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            parser.setLenient(false);
            parser.setTimeZone(TimeZone.getDefault());
            Calendar calendar = Calendar.getInstance(TimeZone.getDefault(), Locale.US);
            calendar.setTime(parser.parse(weekStart));
            calendar.add(Calendar.DAY_OF_MONTH, weekday);
            return new SimpleDateFormat("MM/dd", Locale.getDefault()).format(calendar.getTime());
        } catch (java.text.ParseException ignored) {
            return "";
        }
    }
}
