package com.fridgeboard.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Context;
import android.content.ContextWrapper;

import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Test;

import java.util.Collections;

/** Device-side regression tests for semantic snapshot equality. */
public class RecipeWidgetRepositoryApplyTest {
    @Test
    public void newerCaptureWithSameVisibleDataIsNotADataChange() throws JSONException {
        JSONObject existing = new JSONObject()
                .put("capturedAt", 100L)
                .put("entries", new JSONObject().put("completed", false));
        JSONObject incoming = new JSONObject()
                .put("capturedAt", 200L)
                .put("entries", new JSONObject().put("completed", false));

        assertTrue(RecipeWidgetRepository.sameSnapshotContent(existing, incoming));
    }

    @Test
    public void changedVisibleDataIsNotCollapsedIntoTheSameSnapshot() throws JSONException {
        JSONObject existing = new JSONObject()
                .put("capturedAt", 100L)
                .put("entries", new JSONObject().put("completed", false));
        JSONObject incoming = new JSONObject()
                .put("capturedAt", 200L)
                .put("entries", new JSONObject().put("completed", true));

        assertFalse(RecipeWidgetRepository.sameSnapshotContent(existing, incoming));
    }

    @Test
    public void optimisticToggleChangesImmediatelyAndCanBeRolledBack() {
        Context base = androidx.test.platform.app.InstrumentationRegistry.getInstrumentation()
                .getTargetContext();
        String suffix = ".optimistic-test-" + System.nanoTime();
        Context context = new ContextWrapper(base) {
            @Override public Context getApplicationContext() { return this; }

            @Override public android.content.SharedPreferences getSharedPreferences(
                    String name, int mode) {
                return base.getSharedPreferences(name + suffix, mode);
            }
        };
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        long generation = repository.getAccountGeneration();
        String weekStart = RecipeWidgetRules.weekStart();
        RecipeWidgetModels.Entry entry = new RecipeWidgetModels.Entry(
                "optimistic-entry", 0, "周一", "测试食谱", Collections.emptyList(), false, 0, false);
        repository.putSnapshot(new RecipeWidgetModels.Snapshot(generation, "optimistic-fridge",
                "测试冰箱", "owner", weekStart, 1, Collections.singletonList(entry), "ready", null));

        assertTrue(repository.applyOptimisticToggle(generation, "optimistic-fridge", weekStart,
                entry.getId(), false));
        assertEquals(true, repository.getSnapshotModel(generation, "optimistic-fridge", weekStart)
                .getEntries().get(0).isCompleted());
        assertEquals(true, repository.getSnapshotModel(generation, "optimistic-fridge", weekStart)
                .getEntries().get(0).isPending());
        assertTrue(repository.rollbackOptimisticToggle(generation, "optimistic-fridge", weekStart,
                entry.getId(), false));
        assertEquals(false, repository.getSnapshotModel(generation, "optimistic-fridge", weekStart)
                .getEntries().get(0).isCompleted());
        assertEquals(false, repository.getSnapshotModel(generation, "optimistic-fridge", weekStart)
                .getEntries().get(0).isPending());
        base.deleteSharedPreferences("fridgeboard_recipe_widgets" + suffix);
    }
}
