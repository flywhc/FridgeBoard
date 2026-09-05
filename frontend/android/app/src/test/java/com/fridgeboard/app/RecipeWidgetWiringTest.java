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
        assertTrue(scheduler.contains("KEY_FRIDGE_ID"));
        assertTrue(scheduler.contains("KEY_WEEK_START"));
        assertTrue(scheduler.contains("KEY_ACCOUNT_GENERATION"));
        assertTrue(!scheduler.contains("PeriodicWorkRequest"));
    }

    @Test
    public void workerNeverRetriesAndRefreshesAfterOutcome() throws Exception {
        String worker = read("src/main/java/com/fridgeboard/app/RecipeWidgetAndroidWorker.java");
        assertTrue(worker.contains("RecipeWidgetWorker(repository"));
        assertTrue(worker.contains("RecipeWidgetProvider.refreshAll(context)"));
        assertTrue(worker.contains("return Result.success()"));
        assertTrue(worker.contains("\"offline\""));
        assertTrue(worker.contains("\"auth_expired\""));
        assertTrue(!worker.contains("SharedPreferences"));
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
        assertTrue(manifest.contains("android.intent.action.DATE_CHANGED"));
        assertTrue(manifest.contains("android.permission.RECEIVE_BOOT_COMPLETED"));
        assertTrue(backup.contains("fridgeboard_recipe_widgets.xml"));
        assertTrue(extraction.contains("fridgeboard_recipe_widgets.xml"));
        assertTrue(backup.contains("recipe_widget_logs/"));
        assertTrue(extraction.contains("recipe_widget_logs/"));
        assertTrue(variables.contains("androidxWorkVersion = '2.11.2'"));
    }
}
