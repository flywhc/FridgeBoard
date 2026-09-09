package com.fridgeboard.app;

import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.graphics.Typeface;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import android.text.style.StrikethroughSpan;
import android.text.style.StyleSpan;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import java.util.Collections;
import java.util.List;

/** Builds the outer widget and its static page RemoteViews. */
public final class RecipeWidgetRenderer {
    static final int WIDTH_GRID_DP = 200;

    private RecipeWidgetRenderer() {
    }

    /** 渲染固定标题、列表视口与底部进度。 */
    public static RemoteViews render(Context context, RecipeWidgetModels.Snapshot snapshot,
                                     int widthDp, String state) {
        // Keep one outer layout for every size. Launcher host views can retain the previous
        // root when a resize update swaps RemoteViews layout resources; the width-specific
        // behavior therefore belongs in view properties, while collection rows may still
        // change their own layout as their data is rebound.
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.recipe_widget);
        boolean narrow = widthDp < WIDTH_GRID_DP;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            views.setViewLayoutHeightDimen(R.id.widget_header, narrow
                    ? R.dimen.widget_narrow_title_height : R.dimen.widget_title_height);
            views.setViewLayoutHeightDimen(R.id.widget_footer, narrow
                    ? R.dimen.widget_narrow_footer_height : R.dimen.widget_footer_height);
        }
        // The narrow header has less room beside the refresh hit target; keep the title style
        // while reducing only its size enough to show the bound refrigerator name in full.
        views.setTextViewTextSize(R.id.widget_title, TypedValue.COMPLEX_UNIT_SP,
                narrow ? 14 : 16);
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
            views.setViewVisibility(R.id.widget_status, View.VISIBLE);
            views.setTextViewText(R.id.widget_empty, context.getString(message));
            hideFooterProgress(views);
            views.setViewVisibility(R.id.widget_footer, View.GONE);
            return views;
        }
        views.setViewVisibility(R.id.widget_footer, View.VISIBLE);
        String effectiveState = state == null || state.isEmpty() ? snapshot.getStatus() : state;
        views.setViewVisibility(R.id.widget_status, View.VISIBLE);
        if (narrow) {
            views.setTextViewText(R.id.widget_title, snapshot.getFridgeName());
            views.setViewVisibility(R.id.widget_status, View.GONE);
        }
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

    /** 每条食谱对应一个列表项，滚动与滚动条均交由原生 ListView 管理。 */
    public static RemoteViews renderRow(Context context, RecipeWidgetModels.Entry entry,
                                        boolean showIngredients, String state) {
        RemoteViews views = new RemoteViews(context.getPackageName(), showIngredients
                ? R.layout.recipe_widget_row : R.layout.recipe_widget_row_compact);
        views.setTextViewText(R.id.widget_row_day, entry.getLabel());
        views.setTextViewText(R.id.widget_row_recipe, recipeText(context, entry, showIngredients));
        views.setInt(R.id.widget_row_recipe, "setMaxLines", showIngredients ? 2 : 1);
        views.setTextColor(R.id.widget_row_recipe, context.getColor(entry.isCompleted()
                ? R.color.widget_done : R.color.widget_ink));
        views.setImageViewResource(R.id.widget_row_toggle, entry.isCompleted()
                ? R.drawable.widget_pot_done : R.drawable.widget_pot);
        views.setContentDescription(R.id.widget_row_toggle, context.getString(entry.isCompleted()
                ? R.string.widget_undo_recipe : R.string.widget_complete_recipe, entry.getDishName()));
        views.setBoolean(R.id.widget_row_toggle, "setEnabled",
                !entry.isPending() && !"processing".equals(state));
        // 携带绘制时的状态；旧视图的重复点击不能反向撤销刚完成的操作。
        Intent fillIn = new Intent(RecipeWidgetProvider.ACTION_TOGGLE)
                .putExtra(RecipeWidgetProvider.EXTRA_ENTRY_ID, entry.getId())
                .putExtra(RecipeWidgetProvider.EXTRA_EXPECTED_COMPLETED, entry.isCompleted());
        views.setOnClickFillInIntent(R.id.widget_row_toggle, fillIn);
        return views;
    }

    private static CharSequence recipeText(Context context, RecipeWidgetModels.Entry entry,
                                           boolean showIngredients) {
        String dishText = RecipeWidgetRules.truncateWithEllipsis(entry.getDishName(), 8);
        if (entry.isPending()) dishText = RecipeWidgetRules.truncateWithEllipsis(dishText, 6) + "处理中";
        SpannableStringBuilder result = new SpannableStringBuilder(dishText);
        if (entry.isCompleted()) result.setSpan(new StrikethroughSpan(), 0, result.length(),
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        if (!showIngredients) return result;
        String ingredient = ingredientText(entry);
        if (ingredient.isEmpty()) return result;
        int ingredientStart = result.length();
        result.append(" · ").append(ingredient);
        result.setSpan(new ForegroundColorSpan(context.getColor(entry.getMissingCount() > 0
                        ? R.color.widget_danger : R.color.widget_muted)), ingredientStart,
                result.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        result.setSpan(new StyleSpan(Typeface.NORMAL), ingredientStart, result.length(),
                Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return result;
    }

    private static String ingredientText(RecipeWidgetModels.Entry entry) {
        if (entry.getIngredientsDisplay().isEmpty()) return "";
        String text = RecipeWidgetRules.formatIngredients(entry.getIngredientsDisplay(), 40);
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

    static List<RecipeWidgetModels.Entry> orderedEntries(RecipeWidgetModels.Snapshot snapshot) {
        return snapshot == null ? Collections.emptyList() : RecipeWidgetRules.sortAndFlatten(snapshot.getEntries());
    }
}
