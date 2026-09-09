package com.fridgeboard.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;

import androidx.test.ext.junit.runners.AndroidJUnit4;

/** 验证结构化食材数据经过 Android bridge 规范化后仍保留每项缺货标记。 */
@RunWith(AndroidJUnit4.class)
public final class RecipeWidgetPluginApplyTest {
    @Test
    public void bridgePreservesEachIngredientMissingFlag() throws Exception {
        JSONArray ingredients = new JSONArray()
                .put(new JSONObject().put("displayText", "鸡蛋 × 4-缺2").put("missing", true))
                .put(new JSONObject().put("displayText", "番茄 × 2").put("missing", false));
        JSONArray entries = new JSONArray().put(new JSONObject()
                .put("id", "entry-1")
                .put("weekday", 0)
                .put("label", "周一")
                .put("dishName", "番茄炒蛋")
                .put("ingredientsDisplay", ingredients)
                .put("completed", false)
                .put("missingCount", 1));

        JSONObject snapshot = RecipeWidgetPlugin.buildScopedSnapshot(
                new JSONObject().put("id", "fridge-1").put("name", "厨房冰箱").put("accessRole", "owner"),
                "2026-09-07", 1, entries, 0);
        JSONArray normalized = snapshot.getJSONArray("entries").getJSONObject(0)
                .getJSONArray("ingredientsDisplay");
        assertTrue(normalized.getJSONObject(0).getBoolean("missing"));
        assertFalse(normalized.getJSONObject(1).getBoolean("missing"));
        assertEquals("番茄 × 2", normalized.getJSONObject(1).getString("displayText"));
    }
}
