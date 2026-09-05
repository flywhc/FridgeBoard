package com.fridgeboard.app;

import static org.junit.Assert.assertEquals;

import java.util.Arrays;
import java.util.Collections;

import org.junit.Test;

public class RecipeWidgetModelsTest {
    private static RecipeWidgetModels.Entry sampleEntry() {
        return new RecipeWidgetModels.Entry("entry-1", 0, "周一", "番茄炒蛋",
                Arrays.asList(new RecipeWidgetModels.IngredientDisplay("鸡蛋", "2", "个", true)),
                false, 1, true);
    }

    @Test public void allModelsRoundTripThroughJson() {
        RecipeWidgetModels.FridgeSummary fridge = new RecipeWidgetModels.FridgeSummary("fridge-1", "厨房", "owner");
        assertEquals("厨房", RecipeWidgetModels.FridgeSummary.fromJson(fridge.toJson()).getName());
        RecipeWidgetModels.Entry entry = sampleEntry();
        RecipeWidgetModels.Entry parsedEntry = RecipeWidgetModels.Entry.fromJson(entry.toJson());
        assertEquals("番茄炒蛋", parsedEntry.getDishName());
        assertEquals("鸡蛋 × 2个", parsedEntry.getIngredientsDisplay().get(0).getDisplayText());
        RecipeWidgetModels.Entry preformatted = new RecipeWidgetModels.Entry("entry-2", 1, "周二", "炒饭",
                "米饭 × 1碗", false, 0, false);
        RecipeWidgetModels.Entry parsedPreformatted = RecipeWidgetModels.Entry.fromJson(preformatted.toJson());
        assertEquals("米饭 × 1碗", parsedPreformatted.getIngredientsDisplayText());
        assertEquals(null, parsedPreformatted.getIngredientsDisplay().get(0).getName());
        RecipeWidgetModels.Snapshot snapshot = new RecipeWidgetModels.Snapshot(4, "fridge-1", "厨房", "owner",
                "2026-08-31", 123L, Collections.singletonList(entry), "ready", null);
        RecipeWidgetModels.Snapshot parsed = RecipeWidgetModels.Snapshot.fromJson(snapshot.toJson());
        assertEquals(4L, parsed.getAccountGeneration());
        assertEquals(1, parsed.getEntries().size());
        RecipeWidgetModels.WidgetConfig config = new RecipeWidgetModels.WidgetConfig(42, "fridge-1", "owner", 3);
        assertEquals(3, RecipeWidgetModels.WidgetConfig.fromJson(config.toJson()).getPageIndex());
    }

    @Test(expected = IllegalArgumentException.class)
    public void malformedJsonIsRejected() {
        RecipeWidgetModels.Entry.fromJson("{\"id\":\"x\"");
    }

    @Test(expected = IllegalArgumentException.class)
    public void oversizedJsonIsRejected() {
        StringBuilder json = new StringBuilder("{\"id\":\"");
        for (int i = 0; i < RecipeWidgetModels.MAX_JSON_LENGTH; i++) json.append('x');
        json.append("\",\"name\":\"x\",\"accessRole\":\"owner\"}");
        RecipeWidgetModels.FridgeSummary.fromJson(json.toString());
    }

    @Test(expected = IllegalArgumentException.class)
    public void oversizedTextIsRejected() {
        char[] value = new char[RecipeWidgetModels.MAX_TEXT_LENGTH + 1];
        Arrays.fill(value, '长');
        new RecipeWidgetModels.FridgeSummary(new String(value), "厨房", "owner");
    }

    @Test(expected = IllegalArgumentException.class)
    public void tooManyEntriesAreRejected() {
        java.util.ArrayList<RecipeWidgetModels.Entry> entries = new java.util.ArrayList<>();
        for (int i = 0; i <= RecipeWidgetModels.MAX_ENTRIES; i++) entries.add(sampleEntry());
        new RecipeWidgetModels.Snapshot(1, "fridge", "name", "owner", "2026-08-31", 1, entries, "ready", null);
    }

    @Test(expected = IllegalArgumentException.class)
    public void unsupportedAccessRoleIsRejected() {
        new RecipeWidgetModels.WidgetConfig(1, "fridge", "viewer", 0);
    }

    @Test(expected = IllegalArgumentException.class)
    public void unsupportedFridgeSummaryRoleIsRejected() {
        new RecipeWidgetModels.FridgeSummary("fridge", "name", "viewer");
    }

    @Test(expected = IllegalArgumentException.class)
    public void unsupportedSnapshotRoleIsRejected() {
        new RecipeWidgetModels.Snapshot(1, "fridge", "name", "viewer", "2026-08-31", 1,
                Collections.<RecipeWidgetModels.Entry>emptyList(), "ready", null);
    }

    @Test(expected = IllegalArgumentException.class)
    public void unsupportedSnapshotStatusIsRejected() {
        new RecipeWidgetModels.Snapshot(1, "fridge", "name", "owner", "2026-08-31", 1,
                Collections.<RecipeWidgetModels.Entry>emptyList(), "unknown", null);
    }

    @Test(expected = IllegalArgumentException.class)
    public void nonMondaySnapshotWeekIsRejected() {
        new RecipeWidgetModels.Snapshot(1, "fridge", "name", "owner", "2026-09-01", 1,
                Collections.<RecipeWidgetModels.Entry>emptyList(), "ready", null);
    }

    @Test public void invalidUnicodeEscapeIsRejectedAsBoundaryError() {
        try {
            RecipeWidgetModels.FridgeSummary.fromJson("{\"id\":\"\\u12G4\",\"name\":\"厨房\",\"accessRole\":\"owner\"}");
            throw new AssertionError("invalid unicode escape was accepted");
        } catch (IllegalArgumentException exception) {
            assertEquals(IllegalArgumentException.class, exception.getClass());
        }
    }
}
