package com.fridgeboard.app;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.TimeZone;

import org.junit.Test;

public class RecipeWidgetRulesTest {
    private static RecipeWidgetModels.Entry entry(String id, int weekday, boolean completed) {
        return new RecipeWidgetModels.Entry(id, weekday, "周" + weekday, id,
                Collections.<RecipeWidgetModels.IngredientDisplay>emptyList(), completed, 0, false);
    }

    @Test public void rowsUseTheThreeHeightBoundaries() {
        assertEquals(1, RecipeWidgetRules.rowsForHeight(219));
        assertEquals(2, RecipeWidgetRules.rowsForHeight(220));
        assertEquals(2, RecipeWidgetRules.rowsForHeight(299));
        assertEquals(3, RecipeWidgetRules.rowsForHeight(300));
    }

    @Test public void emptyAndSameDayListsRemainEmptyAndStable() {
        assertEquals(Collections.emptyList(), RecipeWidgetRules.sortAndFlatten(Collections.<RecipeWidgetModels.Entry>emptyList()));
        List<RecipeWidgetModels.Entry> sorted = RecipeWidgetRules.sortAndFlatten(Arrays.asList(
                entry("done", 0, true), entry("first", 2, false), entry("second", 2, false), entry("early", 0, false)));
        assertEquals(Arrays.asList("early", "first", "second", "done"), ids(sorted));
    }

    @Test public void paginationAndClampHandleEmptyAndOverflowPages() {
        assertEquals(1, RecipeWidgetRules.pageCount(0, 2));
        assertEquals(3, RecipeWidgetRules.pageCount(5, 2));
        assertEquals(0, RecipeWidgetRules.clampPage(-3, 3));
        assertEquals(2, RecipeWidgetRules.clampPage(9, 3));
        List<RecipeWidgetModels.Entry> entries = Arrays.asList(entry("a", 0, false), entry("b", 1, false), entry("c", 2, false));
        assertEquals(Arrays.asList("c"), ids(RecipeWidgetRules.pageSlice(entries, 9, 2)));
    }

    @Test public void mondayCalculationUsesLocalTimeAndCrossesYear() {
        TimeZone utc = TimeZone.getTimeZone("UTC");
        assertEquals("2020-12-28", RecipeWidgetRules.weekStart(clock("2021-01-03T23:59:00Z"), utc));
        assertEquals("2021-01-04", RecipeWidgetRules.weekStart(clock("2021-01-04T00:00:00Z"), utc));
        TimeZone shanghai = TimeZone.getTimeZone("Asia/Shanghai");
        assertEquals("2021-01-04", RecipeWidgetRules.weekStart(clock("2021-01-03T16:30:00Z"), shanghai));
        assertEquals("2020-12-28", RecipeWidgetRules.weekStart(clock("2021-01-03T15:59:00Z"), shanghai));
    }

    @Test public void mondayDateValidationRejectsImpossibleAndNonMondayDates() {
        assertEquals(true, RecipeWidgetRules.isMondayDate("2021-02-01"));
        assertEquals(false, RecipeWidgetRules.isMondayDate("2021-02-02"));
        assertEquals(false, RecipeWidgetRules.isMondayDate("2021-02-29"));
        assertEquals(false, RecipeWidgetRules.isMondayDate("2021-13-01"));
        assertEquals(false, RecipeWidgetRules.isMondayDate("2021-00-04"));
    }

    @Test public void statisticsAndDisplayHelpersHandleChineseText() {
        List<RecipeWidgetModels.Entry> entries = Arrays.asList(entry("a", 0, true), entry("b", 1, false));
        RecipeWidgetRules.CompletionStats stats = RecipeWidgetRules.completionStats(entries);
        assertEquals(1, stats.getCompleted());
        assertEquals(2, stats.getTotal());
        assertEquals("中文食", RecipeWidgetRules.truncate("中文食谱", 3));
        assertEquals("中…", RecipeWidgetRules.truncateWithEllipsis("中文食谱", 2));
        assertEquals("缺 2", RecipeWidgetRules.formatMissingCount(2));
        assertEquals("", RecipeWidgetRules.formatMissingCount(0));
        List<RecipeWidgetModels.IngredientDisplay> ingredients = Arrays.asList(
                new RecipeWidgetModels.IngredientDisplay("鸡蛋", "2", "个", false),
                new RecipeWidgetModels.IngredientDisplay("番茄", "1", "个", false));
        assertEquals("鸡蛋 × 2个、番茄 × 1个", RecipeWidgetRules.formatIngredients(ingredients));
    }

    private static List<String> ids(List<RecipeWidgetModels.Entry> entries) {
        java.util.ArrayList<String> result = new java.util.ArrayList<>();
        for (RecipeWidgetModels.Entry entry : entries) result.add(entry.getId());
        return result;
    }

    private static RecipeWidgetRules.Clock clock(final String iso) {
        final long millis;
        try {
            java.text.SimpleDateFormat format = new java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US);
            format.setTimeZone(TimeZone.getTimeZone("UTC"));
            millis = format.parse(iso).getTime();
        } catch (java.text.ParseException exception) {
            throw new AssertionError(exception);
        }
        return new RecipeWidgetRules.Clock() { @Override public long millis() { return millis; } };
    }
}
