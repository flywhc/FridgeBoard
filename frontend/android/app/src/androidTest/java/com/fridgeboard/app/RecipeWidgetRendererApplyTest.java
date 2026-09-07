package com.fridgeboard.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import java.io.InputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

import org.junit.Test;
import org.junit.runner.RunWith;

/** Applies widget RemoteViews to verify the native rendering contract on Android resources. */
@RunWith(AndroidJUnit4.class)
public final class RecipeWidgetRendererApplyTest {
    private static final int HEIGHT_THREE_ROWS_DP = 300;
    private static final String[] DISHES = {
            "番茄炒蛋", "香菇鸡丁", "清蒸鲈鱼", "扬州炒饭", "土豆炖牛腩", "西红柿面", "紫菜蛋花汤"
    };
    private static final String[] LABELS = {
            "周一", "周二", "周三", "周四", "周五", "周六", "周日"
    };

    @Test
    public void threeRowFixtureRendersDistinctPagesAndThreeClickableDots() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        RecipeWidgetModels.Snapshot snapshot = fixture();
        assertEquals(3, RecipeWidgetRules.pageCount(snapshot.getEntries(), HEIGHT_THREE_ROWS_DP));

        String[] firstPage = null;
        String[] secondPage = null;
        for (int page = 0; page < 3; page++) {
            View root = apply(RecipeWidgetRenderer.renderPage(context, 7, snapshot, page,
                    HEIGHT_THREE_ROWS_DP, "idle"), context);
            assertEquals(page < 2 ? 3 : 1, visibleRows(root));
            assertEquals(3, visibleDots(root));
            for (int dot = 1; dot <= 3; dot++) assertTrue(dot(root, dot).isClickable());
            assertEquals("第 " + (page + 1) + " 页，当前页",
                    dot(root, page + 1).getContentDescription().toString());
            for (int dot = 0; dot < 3; dot++) {
                int targetPage = dot;
                String expected = targetPage == page
                        ? "第 " + (targetPage + 1) + " 页，当前页"
                        : "切换到第 " + (targetPage + 1) + " 页";
                assertEquals(expected, dot(root, dot + 1).getContentDescription().toString());
            }

            String[] names = visibleDishNames(root);
            if (page == 0) firstPage = names;
            if (page == 1) secondPage = names;
            assertEquals(page < 2 ? 3 : 1, names.length);
            for (int slot = 0; slot < names.length; slot++) {
                assertEquals(DISHES[page * 3 + slot], names[slot]);
            }
        }
        assertNotEquals(join(firstPage), join(secondPage));
    }

    @Test
    public void loadingStateShowsCopyAndHidesDataAndFooter() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Activity activity = launchHostActivity(context);
        View root = applyAndLayout(RecipeWidgetRenderer.render(context, 7, null, 0,
                HEIGHT_THREE_ROWS_DP, "loading"), activity);

        View content = root.findViewById(R.id.widget_page_content);
        View stack = root.findViewById(R.id.widget_page_stack);
        TextView empty = root.findViewById(R.id.widget_empty);
        TextView status = root.findViewById(R.id.widget_status);
        assertEquals(View.VISIBLE, content.getVisibility());
        assertTrue(content.isShown());
        assertEquals(View.GONE, stack.getVisibility());
        assertTrue(!stack.isShown());
        assertEquals(View.VISIBLE, empty.getVisibility());
        assertTrue(empty.isShown());
        assertEquals("正在加载本周食谱…", empty.getText().toString());
        assertEquals(View.GONE, status.getVisibility());
        assertTrue(!status.isShown());
        assertEquals(View.GONE, root.findViewById(R.id.widget_footer).getVisibility());
        assertTrue(!root.findViewById(R.id.widget_footer).isShown());
        activity.finish();
    }

    @Test
    public void emptySnapshotShowsEmptyCopyAndHidesListView() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Activity activity = launchHostActivity(context);
        RecipeWidgetModels.Snapshot snapshot = new RecipeWidgetModels.Snapshot(
                0, "audit-fridge", "空列表验收冰箱", "owner", "2026-08-31", 1,
                Collections.<RecipeWidgetModels.Entry>emptyList(), "ready", null);
        View root = applyAndLayout(RecipeWidgetRenderer.render(context, 7, snapshot, 0,
                HEIGHT_THREE_ROWS_DP, "ready"), activity);

        View empty = root.findViewById(R.id.widget_empty);
        assertEquals(View.VISIBLE, empty.getVisibility());
        assertTrue(empty.isShown());
        assertEquals("本周还没有食谱", ((TextView) empty).getText().toString());
        assertEquals(View.GONE, root.findViewById(R.id.widget_page_stack).getVisibility());
        assertTrue(!root.findViewById(R.id.widget_page_stack).isShown());
        assertEquals(View.VISIBLE, root.findViewById(R.id.widget_page_content).getVisibility());
        assertTrue(root.findViewById(R.id.widget_page_content).isShown());
        assertEquals("本周完成 0/0",
                ((TextView) root.findViewById(R.id.widget_progress_label)).getText().toString());
        activity.finish();
    }

    @Test
    public void panelAssetsHaveTransparentOutsideAndOpaqueInteriorAtEveryDensity() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Set<String> densityEntries = new TreeSet<>();
        ZipFile apk = new ZipFile(context.getApplicationInfo().sourceDir);
        try {
            Enumeration<? extends ZipEntry> entries = apk.entries();
            while (entries.hasMoreElements()) {
                String name = entries.nextElement().getName();
                if (name.matches("res/drawable-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)-v4/widget_panel\\.9\\.png")) {
                    densityEntries.add(name);
                }
            }
            assertEquals("all density-specific widget_panel assets must be packaged", 5,
                    densityEntries.size());
            for (String name : densityEntries) {
                ZipEntry asset = apk.getEntry(name);
                Bitmap bitmap;
                try (InputStream stream = apk.getInputStream(asset)) {
                    BitmapFactory.Options options = new BitmapFactory.Options();
                    options.inScaled = false;
                    bitmap = BitmapFactory.decodeStream(stream, null, options);
                }
                assertNotNull(name + " must decode", bitmap);
                assertTrue(name + " must retain alpha", bitmap.hasAlpha());
                assertTrue(name + " must have a nine-patch metadata border", bitmap.getWidth() > 4);
                assertEquals(name + " must be square", bitmap.getWidth(), bitmap.getHeight());

                int right = bitmap.getWidth() - 1;
                int bottom = bitmap.getHeight() - 1;
                assertEquals(name + " top-left outside corner", 0,
                        alpha(bitmap, 1, 1));
                assertEquals(name + " top-right outside corner", 0,
                        alpha(bitmap, right - 1, 1));
                assertEquals(name + " bottom-left outside corner", 0,
                        alpha(bitmap, 1, bottom - 1));
                assertEquals(name + " bottom-right outside corner", 0,
                        alpha(bitmap, right - 1, bottom - 1));

                int centerX = bitmap.getWidth() / 2;
                int centerY = bitmap.getHeight() / 2;
                assertTrue(name + " center must be opaque", alpha(bitmap, centerX, centerY) >= 250);
                assertEquals(name + " right outline exterior must be transparent", 0,
                        alpha(bitmap, right - 2, centerY));
                assertEquals(name + " bottom outline exterior must be transparent", 0,
                        alpha(bitmap, centerX, bottom - 2));
                int interiorOffset = Math.round(7 * densityForEntry(name));
                assertTrue(name + " right interior must not be dark external shadow",
                        luminance(bitmap, right - interiorOffset, centerY) >= 100);
                assertTrue(name + " bottom interior must not be dark external shadow",
                        luminance(bitmap, centerX, bottom - interiorOffset) >= 100);
                bitmap.recycle();
            }
        } finally {
            apk.close();
        }
    }

    private static RecipeWidgetModels.Snapshot fixture() {
        List<RecipeWidgetModels.Entry> entries = new ArrayList<>();
        for (int index = 0; index < DISHES.length; index++) {
            entries.add(new RecipeWidgetModels.Entry("audit-entry-" + index, index, LABELS[index],
                    DISHES[index], Collections.<RecipeWidgetModels.IngredientDisplay>emptyList(),
                    false, 0, false));
        }
        return new RecipeWidgetModels.Snapshot(0, "audit-fridge", "确定性验收冰箱", "owner",
                "2026-08-31", 1, entries, "ready", null);
    }

    private static View apply(android.widget.RemoteViews views, Context context) {
        return views.apply(context, new FrameLayout(context));
    }

    private static Activity launchHostActivity(Context context) {
        Intent intent = new Intent(context, MainActivity.class)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        Activity activity = InstrumentationRegistry.getInstrumentation().startActivitySync(intent);
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        return activity;
    }

    private static View applyAndLayout(android.widget.RemoteViews views, Activity activity) {
        final View[] result = new View[1];
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            FrameLayout host = new FrameLayout(activity);
            host.setId(View.generateViewId());
            activity.addContentView(host, new ViewGroup.LayoutParams(600, 600));
            View root = views.apply(activity, host);
            host.addView(root, new FrameLayout.LayoutParams(600, 600));
            root.measure(View.MeasureSpec.makeMeasureSpec(600, View.MeasureSpec.EXACTLY),
                    View.MeasureSpec.makeMeasureSpec(600, View.MeasureSpec.EXACTLY));
            root.layout(0, 0, root.getMeasuredWidth(), root.getMeasuredHeight());
            result[0] = root;
        });
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        assertNotNull(result[0]);
        return result[0];
    }

    private static int alpha(Bitmap bitmap, int x, int y) {
        return android.graphics.Color.alpha(bitmap.getPixel(x, y));
    }

    private static int luminance(Bitmap bitmap, int x, int y) {
        int color = bitmap.getPixel(x, y);
        return (android.graphics.Color.red(color) * 3
                + android.graphics.Color.green(color) * 6
                + android.graphics.Color.blue(color)) / 10;
    }

    private static float densityForEntry(String name) {
        if (name.contains("drawable-xxxhdpi")) return 4f;
        if (name.contains("drawable-xxhdpi")) return 3f;
        if (name.contains("drawable-xhdpi")) return 2f;
        if (name.contains("drawable-hdpi")) return 1.5f;
        return 1f;
    }

    private static int visibleRows(View root) {
        int count = 0;
        for (int id : new int[] {R.id.widget_row_1, R.id.widget_row_2, R.id.widget_row_3}) {
            if (root.findViewById(id).getVisibility() == View.VISIBLE) count++;
        }
        return count;
    }

    private static int visibleDots(View root) {
        int count = 0;
        for (int id : dotIds()) if (root.findViewById(id).getVisibility() == View.VISIBLE) count++;
        return count;
    }

    private static ImageButton dot(View root, int number) {
        return (ImageButton) root.findViewById(dotIds()[number - 1]);
    }

    private static String[] visibleDishNames(View root) {
        List<String> names = new ArrayList<>();
        for (int id : new int[] {R.id.widget_row_1_recipe, R.id.widget_row_2_recipe,
                R.id.widget_row_3_recipe}) {
            TextView value = root.findViewById(id);
            if (value.getText() != null && !value.getText().toString().isEmpty()) {
                names.add(value.getText().toString());
            }
        }
        return names.toArray(new String[0]);
    }

    private static int[] dotIds() {
        return new int[] {R.id.widget_page_dot_1, R.id.widget_page_dot_2, R.id.widget_page_dot_3,
                R.id.widget_page_dot_4, R.id.widget_page_dot_5, R.id.widget_page_dot_6,
                R.id.widget_page_dot_7};
    }

    private static String join(String[] values) {
        if (values == null) return "";
        StringBuilder result = new StringBuilder();
        for (String value : values) result.append('|').append(value);
        return result.toString();
    }
}
