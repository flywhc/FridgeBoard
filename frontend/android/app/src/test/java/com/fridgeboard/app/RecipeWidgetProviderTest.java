package com.fridgeboard.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.util.Collections;
import java.util.Arrays;

import org.junit.Test;

/** Unit tests for provider rendering-state precedence. */
public class RecipeWidgetProviderTest {
    @Test
    public void fullUpdateIsReservedForForcedOrChangedRenders() {
        assertTrue(RecipeWidgetProvider.shouldUseFullUpdate(true, false));
        assertTrue(RecipeWidgetProvider.shouldUseFullUpdate(false, true));
        assertFalse(RecipeWidgetProvider.shouldUseFullUpdate(false, false));
    }

    @Test
    public void renderSignatureIncludesVisibleSnapshotMetadata() {
        RecipeWidgetModels.Snapshot first = snapshot("冰箱一", "ready");
        RecipeWidgetModels.Snapshot renamed = snapshot("冰箱二", "ready");
        RecipeWidgetModels.Snapshot loading = snapshot("冰箱一", "loading");
        assertNotEquals(RecipeWidgetProvider.dataSignature(first, 250, 220),
                RecipeWidgetProvider.dataSignature(renamed, 250, 220));
        assertNotEquals(RecipeWidgetProvider.dataSignature(first, 250, 220),
                RecipeWidgetProvider.dataSignature(loading, 250, 220));
        assertNotEquals(RecipeWidgetProvider.dataSignature(first, 250, 220),
                RecipeWidgetProvider.dataSignature(first, 110, 180));
        assertNotEquals(RecipeWidgetProvider.dataSignature(first, 250, 220, true),
                RecipeWidgetProvider.dataSignature(first, 250, 220, false));
    }

    @Test
    public void entryIdentityAndRenderedStateProtectAgainstStaleClicks() {
        RecipeWidgetModels.Entry first = new RecipeWidgetModels.Entry("first", 0, "周一",
                "第一道菜", Collections.<RecipeWidgetModels.IngredientDisplay>emptyList(), false,
                0, false);
        RecipeWidgetModels.Entry second = new RecipeWidgetModels.Entry("second", 1, "周二",
                "第二道菜", Collections.<RecipeWidgetModels.IngredientDisplay>emptyList(), true,
                0, false);
        assertTrue(RecipeWidgetProvider.canToggleEntry(Arrays.asList(first, second), "first", false));
        assertTrue(RecipeWidgetProvider.canToggleEntry(Arrays.asList(second, first), "first", false));
        assertFalse(RecipeWidgetProvider.canToggleEntry(Arrays.asList(first, second), "second", false));
        assertTrue(RecipeWidgetProvider.canToggleEntry(Arrays.asList(first, second), "second", true));
        assertFalse(RecipeWidgetProvider.canToggleEntry(Arrays.asList(first, second), "deleted", false));
        assertFalse(RecipeWidgetProvider.canToggleEntry(Arrays.asList(first, second), null, false));
    }

    @Test
    public void persistedLoadingStateSurvivesProcessRestartWithoutSnapshot() {
        assertEquals("loading", RecipeWidgetProvider.effectiveState(null, "loading", null));
    }

    @Test
    public void transientStateWinsAndIdleFallsBackToSnapshot() {
        assertEquals("processing", RecipeWidgetProvider.effectiveState(
                "ready", "idle", "processing"));
        assertEquals("ready", RecipeWidgetProvider.effectiveState("ready", "idle", null));
        assertEquals("offline", RecipeWidgetProvider.effectiveState("offline", "idle", null));
        assertEquals("empty", RecipeWidgetProvider.effectiveState("empty", "idle", null));
    }

    private static RecipeWidgetModels.Snapshot snapshot(String fridgeName, String status) {
        return new RecipeWidgetModels.Snapshot(0, "fridge", fridgeName, "owner", "2026-08-31",
                1, Collections.<RecipeWidgetModels.Entry>emptyList(), status, null);
    }
}
