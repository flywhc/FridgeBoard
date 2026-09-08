package com.fridgeboard.app;

import static org.junit.Assert.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.charset.StandardCharsets;

import org.junit.Test;

/** Source-level contracts for the second-stage Android widget wiring. */
public class RecipeWidgetWiringTest {
    private static String read(String path) throws Exception {
        Path source = Paths.get(path);
        if (!Files.exists(source)) source = Paths.get("app").resolve(path).normalize();
        return new String(Files.readAllBytes(source), StandardCharsets.UTF_8);
    }

    @Test
    public void schedulerUsesOneShotSerialChainsAndWhitelistedInputs() throws Exception {
        String scheduler = read("src/main/java/com/fridgeboard/app/RecipeWidgetWorkScheduler.java");
        assertTrue(scheduler.contains("OneTimeWorkRequest"));
        assertTrue(scheduler.contains("ExistingWorkPolicy.APPEND_OR_REPLACE"));
        assertTrue(scheduler.contains("public static boolean enqueueRefresh"));
        assertTrue(scheduler.contains("KEY_FRIDGE_ID"));
        assertTrue(scheduler.contains("KEY_WEEK_START"));
        assertTrue(scheduler.contains("KEY_ACCOUNT_GENERATION"));
        assertTrue(scheduler.contains("KEY_STALE_RECOVERY"));
        assertTrue(scheduler.contains("cancelConfiguredRefreshChains"));
        assertTrue(scheduler.contains("enqueueStartupRefresh"));
        assertTrue(scheduler.contains("ExistingWorkPolicy.REPLACE"));
        assertTrue(!scheduler.contains("PeriodicWorkRequest"));
    }

    @Test
    public void workerNeverRetriesAndRefreshesAfterOutcome() throws Exception {
        String worker = read("src/main/java/com/fridgeboard/app/RecipeWidgetAndroidWorker.java");
        assertTrue(worker.contains("RecipeWidgetWorker(repository"));
        assertTrue(worker.contains("RecipeWidgetProvider.refreshWidget(context, widgetId)"));
        assertTrue(worker.contains("return Result.success()"));
        assertTrue(worker.contains("\"offline\""));
        assertTrue(worker.contains("\"auth_expired\""));
        assertTrue(worker.contains("case STALE_GENERATION:"));
        assertTrue(worker.contains("enqueueStaleRecovery"));
        assertTrue(worker.contains("!staleRecovery"));
        assertTrue(!worker.contains("SharedPreferences"));
        assertTrue(worker.contains("RecipeWidgetProvider.refresh(context, fridgeId)"));
        assertTrue(worker.contains("persistStateForFridge(repository, fridgeId, state)"));
        assertTrue(worker.contains("binding.fridgeId.equals(fridgeId)"));
    }

    @Test
    public void startupRefreshDeduplicatesSharedFridgeChains() throws Exception {
        String provider = read("src/main/java/com/fridgeboard/app/RecipeWidgetProvider.java");
        assertTrue(provider.contains("Set<String> startupFridges"));
        assertTrue(provider.contains("if (!startupFridges.add(binding.fridgeId)) continue;"));
        assertTrue(provider.contains("updateWidget(appContext, manager, widgetId, null, false)"));
        assertTrue(provider.contains("snapshot.getFridgeName()"));
        assertTrue(provider.contains("snapshot.getStatus()"));
        assertTrue(provider.contains("expectedCompleted(appContext, widgetId, page, slot, entryId)"));
    }

    @Test
    public void remoteViewsServiceToleratesCorruptSnapshots() throws Exception {
        String service = read("src/main/java/com/fridgeboard/app/RecipeWidgetRemoteViewsService.java");
        assertTrue(service.contains("try {"));
        assertTrue(service.contains("catch (RuntimeException"));
        assertTrue(service.contains("snapshot = null;"));
        assertTrue(service.contains("entries = Collections.emptyList();"));
    }

    @Test
    public void completedRecipeUsesOnlyThePotIconForItsCheckmark() throws Exception {
        String renderer = read("src/main/java/com/fridgeboard/app/RecipeWidgetRenderer.java");
        assertTrue(!renderer.contains("✓ "));
        assertTrue(renderer.contains("new StrikethroughSpan(), 0, dish.length()"));
    }

    @Test
    public void activityManifestAndBackupRulesExposeRequiredContracts() throws Exception {
        String activity = read("src/main/java/com/fridgeboard/app/MainActivity.java");
        String manifest = read("src/main/AndroidManifest.xml");
        String backup = read("src/main/res/xml/backup_rules.xml");
        String extraction = read("src/main/res/xml/data_extraction_rules.xml");
        String variables = read("../variables.gradle");
        assertTrue(activity.contains("registerPlugin(RecipeWidgetPlugin.class)"));
        assertTrue(manifest.contains(".RecipeWidgetProvider"));
        assertTrue(manifest.contains("android:name=\".RecipeWidgetProvider\"\n            android:exported=\"false\""));
        assertTrue(manifest.contains(".RecipeWidgetConfigureActivity"));
        assertTrue(manifest.contains("android.intent.action.BOOT_COMPLETED"));
        assertTrue(!manifest.contains("android.intent.action.DATE_CHANGED"));
        assertTrue(!manifest.contains("android.intent.action.TIMEZONE_CHANGED"));
        assertTrue(!manifest.contains("android.intent.action.TIME_SET"));
        String provider = read("src/main/java/com/fridgeboard/app/RecipeWidgetProvider.java");
        assertTrue(provider.contains("manager.updateAppWidget(widgetId, views)"));
        assertTrue(provider.contains("updateWidget(context, manager, widgetId, null, true)"));
        assertTrue(provider.contains("boolean forceFullUpdate"));
        assertTrue(provider.contains("RecipeWidgetRules.pageCount(snapshot.getEntries(), widthDp, heightDp)"));
        assertTrue(!provider.contains("pageCount(RecipeWidgetRenderer.orderedEntries(snapshot).size(), heightDp)"));
        assertTrue(provider.contains("setRemoteAdapter(R.id.widget_page_stack"));
        assertTrue(provider.contains("setPendingIntentTemplate(R.id.widget_page_stack"));
        assertTrue(provider.contains("notifyAppWidgetViewDataChanged(widgetId, R.id.widget_page_stack)"));
        assertTrue(!provider.contains("Intent.ACTION_DATE_CHANGED"));
        assertTrue(!provider.contains("Intent.ACTION_TIMEZONE_CHANGED"));
        assertTrue(!provider.contains("Intent.ACTION_TIME_CHANGED"));
        assertTrue(provider.contains("return Intent.ACTION_BOOT_COMPLETED.equals(action);"));
        assertTrue(manifest.contains("android.permission.RECEIVE_BOOT_COMPLETED"));
        assertTrue(read("src/main/res/xml/recipe_widget_info.xml").contains(
                "android:configure=\"com.fridgeboard.app.RecipeWidgetConfigureActivity\""));
        String configureLayout = read("src/main/res/layout/activity_recipe_widget_configure.xml");
        assertTrue(configureLayout.contains("<RadioGroup"));
        assertTrue(configureLayout.contains("android:id=\"@+id/widget_fridge_choices\""));
        assertTrue(backup.contains("fridgeboard_recipe_widgets.xml"));
        assertTrue(extraction.contains("fridgeboard_recipe_widgets.xml"));
        assertTrue(backup.contains("recipe_widget_logs/"));
        assertTrue(extraction.contains("recipe_widget_logs/"));
        assertTrue(variables.contains("androidxWorkVersion = '2.11.2'"));
    }

    @Test
    public void swipeContainerOwnsExactlyOneWholePageAtATime() throws Exception {
        String shell = read("src/main/res/layout/recipe_widget.xml");
        String page = read("src/main/res/layout/recipe_widget_page.xml");
        String service = read("src/main/java/com/fridgeboard/app/RecipeWidgetRemoteViewsService.java");

        assertTrue(shell.contains("<ListView"));
        assertTrue(shell.contains("android:id=\"@+id/widget_page_stack\""));
        assertTrue(!shell.contains("<include layout=\"@layout/recipe_widget_page\""));
        assertTrue(page.contains("android:layout_height=\"match_parent\""));
        assertTrue(service.contains("RecipeWidgetRules.pageCount(entries, widthDp, heightDp)"));
        assertTrue(service.contains("RecipeWidgetProvider.widgetHeight(manager, widgetId)"));
        assertTrue(service.contains("RecipeWidgetProvider.widgetWidth(manager, widgetId)"));
        assertTrue(service.contains("RecipeWidgetRenderer.renderPage"));
    }

    @Test
    public void widgetMetadataDefaultsToFourByTwoAndAllowsTwoByTwoResize() throws Exception {
        String info = read("src/main/res/xml/recipe_widget_info.xml");
        assertTrue(info.contains("android:targetCellWidth=\"4\""));
        assertTrue(info.contains("android:targetCellHeight=\"2\""));
        assertTrue(info.contains("android:minResizeWidth=\"110dp\""));
        assertTrue(info.contains("android:minResizeHeight=\"180dp\""));
        assertTrue(info.contains("android:maxResizeHeight=\"180dp\""));
        assertTrue(info.contains("android:resizeMode=\"horizontal\""));
    }

    @Test
    public void compactPageHasWideGridAndNarrowFallbackLayouts() throws Exception {
        String page = read("src/main/res/layout/recipe_widget_page.xml");
        String narrow = read("src/main/res/layout/recipe_widget_page_narrow.xml");
        String renderer = read("src/main/java/com/fridgeboard/app/RecipeWidgetRenderer.java");
        assertTrue(page.contains("@layout/recipe_widget_row_4"));
        assertTrue(narrow.contains("@layout/recipe_widget_row_4"));
        assertTrue(renderer.contains("R.layout.recipe_widget_page_narrow"));
        assertTrue(renderer.contains("RecipeWidgetRules.columnsForWidth(widthDp)"));
        assertTrue(renderer.contains("formatIngredients(entry.getIngredientsDisplay(), 40)"));
        assertTrue(renderer.contains("truncateWithEllipsis(entry.getDishName(), 8)"));
    }

    @Test
    public void configurePageUsesSafeAreaAndSkeuomorphicControls() throws Exception {
        String activity = read("src/main/java/com/fridgeboard/app/RecipeWidgetConfigureActivity.java");
        String manifest = read("src/main/AndroidManifest.xml");
        String layout = read("src/main/res/layout/activity_recipe_widget_configure.xml");
        String strings = read("src/main/res/values/widget_strings.xml");
        String styles = read("src/main/res/values/widget_styles.xml");
        String choice = read("src/main/res/drawable/widget_config_choice.xml");
        String fridgeIcon = read("src/main/res/drawable/widget_config_fridge.xml");
        String primaryButton = read("src/main/res/drawable/widget_config_button_primary.xml");
        String secondaryButton = read("src/main/res/drawable/widget_config_button_secondary.xml");

        assertTrue(activity.contains("WindowCompat.setDecorFitsSystemWindows(getWindow(), false)"));
        assertTrue(activity.contains("ViewCompat.setOnApplyWindowInsetsListener"));
        assertTrue(activity.contains("WindowInsetsCompat.Type.systemBars()"));
        assertTrue(manifest.contains("android:theme=\"@style/AppTheme.NoActionBar\""));
        assertTrue(layout.contains("android:id=\"@+id/widget_config_root\""));
        assertTrue(layout.contains("@style/WidgetConfigSecondaryButton"));
        assertTrue(layout.contains("@style/WidgetConfigPrimaryButton"));
        assertTrue(strings.contains("<string name=\"widget_config_title\">选择显示哪个冰箱</string>"));
        assertTrue(styles.contains("@drawable/widget_config_button_secondary"));
        assertTrue(styles.contains("@drawable/widget_config_button_primary"));
        assertTrue(choice.contains("android:state_checked=\"true\""));
        assertTrue(activity.contains("setButtonDrawable((android.graphics.drawable.Drawable) null)"));
        assertTrue(activity.contains("R.drawable.widget_config_fridge"));
        assertTrue(fridgeIcon.contains("@color/widget_ink"));
        assertTrue(primaryButton.contains("android:state_pressed=\"true\""));
        assertTrue(secondaryButton.contains("android:state_pressed=\"true\""));
        assertTrue(primaryButton.contains("@drawable/primary_master"));
        assertTrue(secondaryButton.contains("@drawable/secondary_master"));
        assertTrue(layout.contains("android:layout_width=\"0dp\"\n            android:layout_height=\"@dimen/widget_config_button_height\"\n            android:layout_weight=\"1\""));
        assertTrue(layout.contains("android:layout_marginStart=\"8dp\"\n            android:layout_weight=\"1\""));
        assertTrue(!layout.contains("widget_config_button_primary_disabled"));
        assertTrue(!layout.contains("widget_config_button_secondary_disabled"));
        assertTrue(!layout.contains("danger-master"));
        assertTrue(!styles.contains("@color/widget_success</item>"));
    }

    @Test
    public void configurationRendersOnceBeforeReturningToLauncher() throws Exception {
        String activity = read("src/main/java/com/fridgeboard/app/RecipeWidgetConfigureActivity.java");
        assertTrue(activity.contains("RecipeWidgetProvider.refreshWidget(this, widgetId)"));
        assertTrue(activity.indexOf("RecipeWidgetProvider.refreshWidget(this, widgetId)")
                < activity.indexOf("setResult(RESULT_OK, result)"));
        assertTrue(!activity.contains("postDelayed("));
        String provider = read("src/main/java/com/fridgeboard/app/RecipeWidgetProvider.java");
        assertTrue(provider.contains("if (!forceFullUpdate && renderSignature.equals"));
    }
}
