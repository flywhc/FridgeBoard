package com.fridgeboard.app;

import static org.junit.Assert.assertEquals;
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
import android.widget.ImageView;
import android.widget.ListView;
import android.widget.BaseAdapter;
import android.content.ContextWrapper;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.view.Gravity;
import android.widget.TextView;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;

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
    private static final int WIDTH_GRID_DP = 250;
    private static final int WIDTH_NARROW_DP = 110;
    private static final int HEIGHT_COMPACT_DP = 220;
    private static final String[] DISHES = {
            "番茄炒蛋", "香菇鸡丁", "清蒸鲈鱼", "扬州炒饭", "土豆炖牛腩", "西红柿面", "紫菜蛋花汤"
    };
    private static final String[] LABELS = {
            "周一", "周二", "周三", "周四", "周五", "周六", "周日"
    };

    @Test
    public void rowModesKeepNameAndIngredientsInOneTextFlow() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        for (boolean ingredients : new boolean[] {true, false}) {
            for (int index = 0; index < DISHES.length; index++) {
                View row = apply(RecipeWidgetRenderer.renderRow(context,
                        fixture().getEntries().get(index), ingredients, "idle"), context);
                TextView text = row.findViewById(R.id.widget_row_recipe);
                assertEquals(ingredients ? 2 : 1, text.getMaxLines());
                assertTrue(text.getText().toString().startsWith(DISHES[index]));
                assertEquals(ingredients, text.getText().toString().contains("验收食材" + index));
                assertTrue(!text.getText().toString().contains("\n"));
                assertEquals(context.getString(R.string.widget_complete_recipe, DISHES[index]),
                        row.findViewById(R.id.widget_row_toggle).getContentDescription().toString());
            }
        }
    }

    @Test
    public void rowColorsOnlyMissingIngredientsAsDanger() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        RecipeWidgetModels.Entry entry = new RecipeWidgetModels.Entry(
                "mixed-ingredients", 0, "周一", "番茄炒蛋", java.util.Arrays.asList(
                        new RecipeWidgetModels.IngredientDisplay("鸡蛋", "4", "个", true),
                        new RecipeWidgetModels.IngredientDisplay("番茄", "2", "个", false)),
                false, 1, false);
        TextView text = (TextView) apply(RecipeWidgetRenderer.renderRow(context, entry, true, "idle"), context)
                .findViewById(R.id.widget_row_recipe);
        Spanned styled = (Spanned) text.getText();
        assertEquals(context.getColor(R.color.widget_danger), colorAt(styled, "鸡蛋×"));
        assertEquals(context.getColor(R.color.widget_ink), colorAt(styled, "番茄×"));
        assertEquals(context.getColor(R.color.widget_danger), colorAt(styled, "缺 1"));
    }

    @Test
    public void nativeListScrollsIndividualRowsAndKeepsFooterFixed() {
        Context base = InstrumentationRegistry.getInstrumentation().getTargetContext();
        // 隔离偏好命名空间，避免验收夹具覆盖用户的 Widget 绑定和缓存。
        String suffix = ".list-test-" + System.nanoTime();
        Context context = new ContextWrapper(base) {
            @Override public Context getApplicationContext() { return this; }
            @Override public SharedPreferences getSharedPreferences(String name, int mode) {
                return base.getSharedPreferences(name + suffix, mode);
            }
        };
        RecipeWidgetRepository repository = new RecipeWidgetRepository(context);
        RecipeWidgetModels.Snapshot data = new RecipeWidgetModels.Snapshot(
                repository.getAccountGeneration(), "list-test", "列表验收冰箱", "owner",
                RecipeWidgetRules.weekStart(), 1, fixture().getEntries(), "ready", null);
        repository.putSnapshot(data);
        Activity activity = launchHostActivity(base);
        try {
            for (int width : new int[] {180, 360}) {
                for (boolean ingredients : new boolean[] {true, false}) {
                    repository.putWidgetBinding(98765, "list-test", "owner", ingredients);
                    RecipeWidgetRemoteViewsService.Factory factory =
                            new RecipeWidgetRemoteViewsService.Factory(context, 98765);
                    factory.onCreate();
                    assertEquals(7, factory.getCount());
                    assertEquals(null, factory.getViewAt(-1));
                    assertEquals(null, factory.getViewAt(7));
                    verifyScrollingLayout(activity, base, data, width, ingredients, factory);
                    factory.onDestroy();
                }
            }
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
            repository.removeWidget(98765);
            base.deleteSharedPreferences("fridgeboard_recipe_widgets" + suffix);
        }
    }

    private static void verifyScrollingLayout(Activity activity, Context base,
            RecipeWidgetModels.Snapshot data, int width, boolean ingredients,
            RecipeWidgetRemoteViewsService.Factory factory) {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            FrameLayout host = new FrameLayout(activity);
            View shell = RecipeWidgetRenderer.render(base, data, width, "idle")
                    .apply(base, host);
            int widthPx = dp(activity, width);
            int heightPx = dp(activity, 220);
            host.addView(shell, new FrameLayout.LayoutParams(widthPx, heightPx, Gravity.TOP));
            activity.setContentView(host);
            ListView list = shell.findViewById(R.id.widget_page_stack);
            list.setAdapter(new BaseAdapter() {
                @Override public int getCount() { return factory.getCount(); }
                @Override public Object getItem(int position) { return position; }
                @Override public long getItemId(int position) { return position; }
                @Override public View getView(int position, View convert, ViewGroup parent) {
                    return factory.getViewAt(position).apply(base, parent);
                }
            });
            layout(shell, widthPx, heightPx);
            assertTrue(list.isVerticalScrollBarEnabled());
            assertTrue(!list.isScrollbarFadingEnabled());
            assertEquals(View.SCROLLBAR_POSITION_RIGHT, list.getVerticalScrollbarPosition());
            assertTrue(list.canScrollVertically(1));
            assertEquals(7, list.getCount());
            int required = ingredients ? 2 : 3;
            assertTrue("首屏必须完整显示 " + required + " 条",
                    list.getChildAt(required - 1).getBottom() <= list.getHeight());
            TextView first = list.getChildAt(0).findViewById(R.id.widget_row_recipe);
            assertTrue(first.getText().toString().startsWith(DISHES[0]));
            assertTrue(first.getHeight() >= first.getLineHeight() * first.getLineCount());
            int footerTop = shell.findViewById(R.id.widget_footer).getTop();
            // 使用真实 ListView 的像素滚动，不能再以整页为 adapter item。
            list.scrollListBy(dp(activity, ingredients ? 70 : 50));
            assertTrue(list.getFirstVisiblePosition() > 0);
            assertEquals(footerTop, shell.findViewById(R.id.widget_footer).getTop());
            list.setSelection(6);
            layout(shell, widthPx, heightPx);
            assertEquals(6, list.getLastVisiblePosition());
            TextView last = list.getChildAt(list.getChildCount() - 1)
                    .findViewById(R.id.widget_row_recipe);
            assertTrue(last.getText().toString().startsWith(DISHES[6]));
            if (android.os.Build.VERSION.SDK_INT >= 29) {
                Drawable thumb = list.getVerticalScrollbarThumbDrawable();
                assertNotNull(thumb);
                Bitmap bitmap = Bitmap.createBitmap(12, 60, Bitmap.Config.ARGB_8888);
                thumb.setBounds(0, 0, 12, 60);
                thumb.draw(new Canvas(bitmap));
                assertEquals(activity.getColor(R.color.widget_progress_fill),
                        bitmap.getPixel(6, 30));
                bitmap.recycle();
            }
        });
    }

    private static int dp(Context context, int value) {
        return Math.round(value * context.getResources().getDisplayMetrics().density);
    }

    private static int colorAt(Spanned text, String value) {
        int start = text.toString().indexOf(value);
        assertTrue(value + " must be rendered", start >= 0);
        for (ForegroundColorSpan span : text.getSpans(0, text.length(), ForegroundColorSpan.class)) {
            if (text.getSpanStart(span) <= start && text.getSpanEnd(span) > start) {
                return span.getForegroundColor();
            }
        }
        StringBuilder spans = new StringBuilder();
        for (ForegroundColorSpan span : text.getSpans(0, text.length(), ForegroundColorSpan.class)) {
            spans.append('[').append(text.getSpanStart(span)).append(',')
                    .append(text.getSpanEnd(span)).append(']').append(span.getForegroundColor());
        }
        throw new AssertionError(value + " must have a color span in '" + text + "': " + spans);
    }

    private static void layout(View root, int width, int height) {
        root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY),
                View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, width, height);
    }

    @Test
    public void twoByTwoHeaderKeepsOnlyFridgeNameInTitleStyle() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        View root = apply(RecipeWidgetRenderer.render(context, fixture(), WIDTH_NARROW_DP, "idle"), context);
        assertEquals("确定性验收冰箱", ((TextView) root.findViewById(R.id.widget_title))
                .getText().toString());
        assertEquals(View.GONE, root.findViewById(R.id.widget_status).getVisibility());
        ImageView refresh = root.findViewById(R.id.widget_refresh);
        assertEquals(View.VISIBLE, refresh.getVisibility());
        assertEquals(ImageView.ScaleType.CENTER_INSIDE, refresh.getScaleType());
        int padding = dp(context, 0);
        assertEquals(padding, refresh.getPaddingLeft());
        assertEquals(padding, refresh.getPaddingTop());
        assertEquals(padding, refresh.getPaddingRight());
        assertEquals(padding, refresh.getPaddingBottom());
        assertEquals(dp(context, 18), refresh.getDrawable().getIntrinsicWidth());
        assertEquals(dp(context, 18), refresh.getDrawable().getIntrinsicHeight());
    }

    @Test
    public void loadingStateKeepsHeaderSilentAndHidesDataAndFooter() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Activity activity = launchHostActivity(context);
        View root = applyAndLayout(RecipeWidgetRenderer.render(context, null, WIDTH_GRID_DP, "loading"), activity);

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
        assertEquals("本周还没有食谱", empty.getText().toString());
        assertEquals(View.GONE, status.getVisibility());
        assertTrue(!status.isShown());
        assertEquals(View.GONE, root.findViewById(R.id.widget_footer).getVisibility());
        assertTrue(!root.findViewById(R.id.widget_footer).isShown());
        activity.finish();
    }

    @Test
    public void emptySnapshotShowsEmptyCopyAndHidesPageStack() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Activity activity = launchHostActivity(context);
        RecipeWidgetModels.Snapshot snapshot = new RecipeWidgetModels.Snapshot(
                0, "audit-fridge", "空列表验收冰箱", "owner", "2026-08-31", 1,
                Collections.<RecipeWidgetModels.Entry>emptyList(), "ready", null);
        View root = applyAndLayout(RecipeWidgetRenderer.render(context, snapshot, WIDTH_GRID_DP, "ready"), activity);

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
                    DISHES[index], Collections.singletonList(new RecipeWidgetModels.IngredientDisplay(
                            "验收食材" + index, "验收食材" + index, false)),
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

}
