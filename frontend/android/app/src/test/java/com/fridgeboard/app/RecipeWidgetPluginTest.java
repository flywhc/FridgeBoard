package com.fridgeboard.app;

import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import org.junit.Test;

/** Contract tests for the plugin's native bridge wiring. */
public class RecipeWidgetPluginTest {
    @Test
    public void publishWeekUsesConditionalWriteBeforeReadyStateAndRedraw() throws Exception {
        Path source = Paths.get("src/main/java/com/fridgeboard/app/RecipeWidgetPlugin.java");
        if (!Files.exists(source)) source = Paths.get("app").resolve(source).normalize();
        String plugin = new String(Files.readAllBytes(source), StandardCharsets.UTF_8);

        assertTrue(plugin.contains("putSnapshotIfNewer"));
        assertTrue(plugin.contains("if (!snapshotUpdated)"));
        assertTrue(plugin.contains("RecipeWidgetProvider.refresh(context, refrigeratorId)"));
        assertTrue(plugin.indexOf("if (!snapshotUpdated)")
                < plugin.indexOf("markWidgetsReady(refrigeratorId)"));
        assertTrue(plugin.indexOf("markWidgetsReady(refrigeratorId)")
                < plugin.indexOf("refresh(refrigeratorId)"));
    }

    @Test
    public void bridgeKeepsReplacementAndStructuredIngredientContracts() throws Exception {
        Path source = Paths.get("src/main/java/com/fridgeboard/app/RecipeWidgetPlugin.java");
        if (!Files.exists(source)) source = Paths.get("app").resolve(source).normalize();
        String plugin = new String(Files.readAllBytes(source), StandardCharsets.UTF_8);

        assertTrue(plugin.contains("repository().replaceFridgeSummaries(fridges)"));
        assertTrue(plugin.contains("source.getJSONArray(\"ingredientsDisplay\")"));
        assertTrue(plugin.contains("sourceIngredient.getString(\"displayText\")"));
        assertTrue(plugin.contains("sourceIngredient.getBoolean(\"missing\")"));
        assertTrue(plugin.contains("store.setWidgetState(widgetId, \"idle\")"));
    }

    @Test
    public void nativeEntryModelAllowsNoIngredients() {
        RecipeWidgetModels.Entry entry = new RecipeWidgetModels.Entry(
                "entry-1", 0, "周一", "清粥", Collections.emptyList(), false, 0, false);

        assertTrue(entry.toJson().contains("\"ingredientsDisplay\":[]"));
    }

}
