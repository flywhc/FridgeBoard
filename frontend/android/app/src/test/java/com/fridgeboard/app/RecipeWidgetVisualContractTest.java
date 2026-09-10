package com.fridgeboard.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

import org.junit.Test;

/** Source contracts for the approved compact skeuomorphic widget composition. */
public class RecipeWidgetVisualContractTest {
    private static Path path(String relative) {
        Path source = Paths.get(relative);
        return Files.exists(source) ? source : Paths.get("app").resolve(relative).normalize();
    }

    private static String read(String path) throws Exception {
        return new String(Files.readAllBytes(path(path)), StandardCharsets.UTF_8);
    }

    @Test
    public void footerContainsOnlyCompletionProgress() throws Exception {
        String layout = read("src/main/res/layout/recipe_widget.xml");
        assertTrue(layout.contains("@+id/widget_progress_label"));
        assertTrue(layout.contains("@+id/widget_progress"));
        assertTrue(layout.contains("@+id/widget_footer"));
        assertTrue(layout.contains("@+id/widget_status"));
        assertFalse(layout.contains("@+id/widget_previous"));
        assertFalse(layout.contains("@+id/widget_next"));
        assertFalse(layout.contains("@+id/widget_page\""));
    }

    @Test
    public void fridgeNameUsesTheCompactHeaderStatusSlot() throws Exception {
        String layout = read("src/main/res/layout/recipe_widget.xml");
        String narrow = read("src/main/res/layout/recipe_widget_narrow.xml");
        assertTrue(layout.contains("@dimen/widget_title_height"));
        assertTrue(layout.contains("@+id/widget_title"));
        assertTrue(layout.contains("@+id/widget_status"));
        assertTrue(layout.contains("@dimen/widget_status_width"));
        int statusStart = layout.indexOf("android:id=\"@+id/widget_status\"");
        int refreshStart = layout.indexOf("android:id=\"@+id/widget_refresh\"");
        assertFalse(layout.substring(statusStart, refreshStart).contains(
                "android:ellipsize=\"end\""));
        assertFalse(layout.contains("android:layout_height=\"18dp\""));
        assertTrue(narrow.contains("@dimen/widget_narrow_title_height"));
        assertTrue(narrow.contains("android:visibility=\"gone\""));
    }

    @Test
    public void rowsUseRaisedDayBadgesAndUnframedPotButtons() throws Exception {
        String row = read("src/main/res/layout/recipe_widget_row.xml");
        String styles = read("src/main/res/values/widget_styles.xml");
        assertTrue(styles.contains("@drawable/widget_day_badge"));
        assertTrue(styles.contains("@android:color/transparent"));
        assertFalse(row.contains("@drawable/widget_pot_button"));
        assertTrue(read("src/main/java/com/fridgeboard/app/RecipeWidgetRenderer.java")
                .contains("R.drawable.widget_pot_done : R.drawable.widget_pot"));
    }

    @Test
    public void rightRailUsesNativeCoffeeScrollbar() throws Exception {
        for (String name : new String[] {"recipe_widget", "recipe_widget_narrow"}) {
            String shell = read("src/main/res/layout/" + name + ".xml");
            assertTrue(shell.contains("<ListView"));
            assertTrue(shell.contains("android:scrollbars=\"vertical\""));
            assertTrue(shell.contains("android:verticalScrollbarPosition=\"right\""));
            assertTrue(shell.contains("android:fadeScrollbars=\"false\""));
            assertTrue(shell.contains("@drawable/widget_scrollbar_thumb"));
            assertFalse(shell.contains("widget_page_dot"));
        }
        assertTrue(read("src/main/res/drawable/widget_scrollbar_thumb.xml")
                .contains("@color/widget_progress_fill"));
        String provider = read("src/main/java/com/fridgeboard/app/RecipeWidgetProvider.java");
        assertFalse(provider.contains("ACTION_PAGE"));
        assertFalse(provider.contains("setScrollPosition"));
    }

    @Test
    public void usesFinalSkeuomorphicPaletteAndInitialLoadingState() throws Exception {
        String colors = read("src/main/res/values/widget_colors.xml");
        String layout = read("src/main/res/layout/recipe_widget.xml");
        assertTrue(colors.contains("name=\"widget_paper\">#EBE6DD"));
        assertTrue(colors.contains("name=\"widget_surface\">#F0EADF"));
        assertTrue(colors.contains("name=\"widget_ink\">#765B48"));
        assertTrue(colors.contains("name=\"widget_muted\">#9A826F"));
        assertTrue(colors.contains("name=\"widget_input\">#DCC9B6"));
        assertTrue(layout.contains("android:visibility=\"gone\""));
        assertTrue(layout.indexOf("@+id/widget_page_content") < layout.indexOf("android:visibility=\"gone\""));
        assertTrue(layout.contains("@+id/widget_footer"));
    }

    @Test
    public void usesCanonicalRefreshAndPotSemantics() throws Exception {
        String renderer = read("src/main/java/com/fridgeboard/app/RecipeWidgetRenderer.java");
        String refresh = read("src/main/res/drawable/widget_refresh.xml");
        String dimens = read("src/main/res/values/widget_dimens.xml");
        String pot = read("src/main/res/drawable/widget_pot.xml");
        String potDone = read("src/main/res/drawable/widget_pot_done.xml");
        assertTrue(refresh.contains("M19.295 12"));
        assertTrue(refresh.contains("zm-9.05-12"));
        assertTrue(refresh.contains("android:fillColor=\"@color/widget_ink\""));
        assertTrue(refresh.contains("android:viewportWidth=\"20\""));
        assertTrue(dimens.contains("<dimen name=\"widget_touch_size\">48dp</dimen>"));
        assertTrue(dimens.contains("<dimen name=\"widget_refresh_padding\">0dp</dimen>"));
        assertTrue(dimens.contains("<dimen name=\"widget_refresh_icon_size\">18dp</dimen>"));
        assertTrue(refresh.contains("android:width=\"@dimen/widget_refresh_icon_size\""));
        assertTrue(refresh.contains("android:height=\"@dimen/widget_refresh_icon_size\""));
        for (String name : new String[] {"recipe_widget", "recipe_widget_narrow",
                "recipe_widget_preview"}) {
            assertTrue(read("src/main/res/layout/" + name + ".xml")
                    .contains("android:scaleType=\"centerInside\""));
        }
        assertTrue(pot.contains("M88,48"));
        assertTrue(pot.contains("android:viewportWidth=\"256\""));
        assertTrue(potDone.contains("M88,48"));
        assertTrue(potDone.contains("M96,140"));
        assertFalse(Files.exists(path("src/main/res/drawable-mdpi/widget_refresh.png")));
        assertFalse(Files.exists(path("src/main/res/drawable-mdpi/widget_pot.png")));
        assertFalse(Files.exists(path("src/main/res/drawable-mdpi/widget_pot_done.png")));
        assertTrue(renderer.contains("R.drawable.widget_pot_done : R.drawable.widget_pot"));
        assertTrue(renderer.contains("setContentDescription(R.id.widget_row_toggle"));
    }

    @Test
    public void panelIsDerivedFromNavigationSkinWithoutOuterBottomRightShadow() throws Exception {
        String manifest = read("../widget-assets.json");
        assertTrue(manifest.contains("frontend/public/assets/theme/navigation/bottom-left.webp"));
        assertTrue(manifest.contains("frontend/public/assets/theme/navigation/bottom-center.webp"));
        assertTrue(manifest.contains("frontend/public/assets/theme/navigation/bottom-right.webp"));
        assertTrue(manifest.contains("\"outerShadow\": \"none\""));
        assertTrue(manifest.contains("\"outsideCorners\": \"transparent\""));

        assertImageDimensions("src/main/res/drawable-mdpi/widget_panel.9.png", 98, 98);
        byte[] panel = Files.readAllBytes(path(
                "src/main/res/drawable-mdpi/widget_panel.9.png"));
        assertEquals("panel must be an RGBA PNG", 6, panel[25] & 0xff);
    }

    @Test
    public void rowsRetainMaterialsWithoutNegativeScrollbarMargins() throws Exception {
        String row = read("src/main/res/layout/recipe_widget_row.xml");
        assertTrue(Files.exists(path("src/main/res/drawable-mdpi/widget_panel.9.png")));
        assertTrue(Files.exists(path("src/main/res/drawable-mdpi/widget_row.9.png")));
        assertFalse(row.contains("widget_pot_end_compensation"));
        assertTrue(row.contains("@dimen/widget_row_height"));
        assertTrue(row.contains("@style/WidgetPotButton"));
        assertTrue(read("src/main/res/values/widget_dimens.xml")
                .contains("<dimen name=\"widget_row_height\">56dp</dimen>"));
        assertFalse(row.contains("_ingredients"));
    }

    @Test
    public void configSwitchUsesInsetCoffeeTrackAndPaperThumb() throws Exception {
        String colors = read("src/main/res/values/widget_colors.xml");
        String track = read("src/main/res/drawable/widget_config_switch_track.xml");
        String thumb = read("src/main/res/drawable/widget_config_switch_thumb.xml");
        assertTrue(colors.contains("name=\"widget_config_switch_track\">#DCC9B6"));
        assertTrue(colors.contains("name=\"widget_config_switch_thumb\">#EBE6DD"));
        assertTrue(track.contains("widget_config_switch_track_shadow"));
        assertTrue(track.contains("widget_config_switch_track_highlight"));
        assertTrue(thumb.contains("widget_config_switch_thumb_shadow"));
    }

    private static void assertImageSize(String relative, int expected) throws Exception {
        assertImageDimensions(relative, expected, expected);
    }

    private static void assertImageDimensions(String relative, int expectedWidth,
                                              int expectedHeight) throws Exception {
        byte[] png = Files.readAllBytes(path(relative));
        assertTrue(relative + " must contain a PNG header", png.length > 24
                && png[0] == (byte) 0x89 && png[1] == 0x50 && png[2] == 0x4e
                && png[3] == 0x47);
        int width = bigEndianInt(png, 16);
        int height = bigEndianInt(png, 20);
        assertTrue(relative + " has unexpected dimensions",
                width == expectedWidth && height == expectedHeight);
    }

    private static int bigEndianInt(byte[] value, int offset) {
        return (value[offset] & 0xff) << 24 | (value[offset + 1] & 0xff) << 16
                | (value[offset + 2] & 0xff) << 8 | value[offset + 3] & 0xff;
    }

}
