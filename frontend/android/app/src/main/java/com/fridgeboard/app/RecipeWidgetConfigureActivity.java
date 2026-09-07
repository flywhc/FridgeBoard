package com.fridgeboard.app;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.Collections;
import java.util.List;

/** Lets the launcher bind one widget instance to one refrigerator without storing credentials. */
public final class RecipeWidgetConfigureActivity extends Activity {
    private int widgetId = AppWidgetManager.INVALID_APPWIDGET_ID;
    private RadioGroup choices;
    private List<RecipeWidgetModels.FridgeSummary> summaries = Collections.emptyList();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setResult(RESULT_CANCELED);
        widgetId = getIntent().getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID,
                AppWidgetManager.INVALID_APPWIDGET_ID);
        if (widgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish();
            return;
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        setContentView(R.layout.activity_recipe_widget_configure);
        View root = findViewById(R.id.widget_config_root);
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            int topInset = insets.getInsets(WindowInsetsCompat.Type.systemBars()).top;
            int bottomInset = insets.getInsets(WindowInsetsCompat.Type.systemBars()).bottom;
            int pagePadding = getResources().getDimensionPixelSize(
                    R.dimen.widget_config_page_padding);
            view.setPadding(view.getPaddingLeft(), pagePadding + topInset,
                    view.getPaddingRight(), pagePadding + bottomInset);
            return insets;
        });
        ViewCompat.requestApplyInsets(root);
        choices = findViewById(R.id.widget_fridge_choices);
        Button cancel = findViewById(R.id.widget_config_cancel);
        Button save = findViewById(R.id.widget_config_save);
        cancel.setOnClickListener(view -> finish());
        save.setOnClickListener(view -> saveSelection());
        loadSummaries();
    }

    private void loadSummaries() {
        summaries = listSummaries();
        if (summaries.isEmpty()) {
            TextView empty = new TextView(this);
            empty.setText(R.string.widget_config_empty);
            empty.setTextColor(getColor(R.color.widget_muted));
            empty.setTextSize(16);
            empty.setPadding(8, 16, 8, 16);
            choices.addView(empty);
            findViewById(R.id.widget_config_save).setEnabled(false);
            return;
        }
        RecipeWidgetRepository.WidgetBinding existing =
                new RecipeWidgetRepository(this).getWidgetBinding(widgetId);
        for (int index = 0; index < summaries.size(); index++) {
            RecipeWidgetModels.FridgeSummary summary = summaries.get(index);
            RadioButton option = new RadioButton(this);
            option.setId(View.generateViewId());
            option.setMinHeight(getResources().getDimensionPixelSize(
                    R.dimen.widget_config_choice_height));
            option.setText(summary.getName());
            option.setTextSize(16);
            option.setTag(summary.getId());
            option.setGravity(android.view.Gravity.CENTER_VERTICAL);
            option.setPadding(getResources().getDimensionPixelSize(
                            R.dimen.widget_config_choice_horizontal_padding),
                    0,
                    getResources().getDimensionPixelSize(
                            R.dimen.widget_config_choice_horizontal_padding),
                    0);
            option.setBackgroundResource(R.drawable.widget_config_choice);
            option.setButtonDrawable((android.graphics.drawable.Drawable) null);
            option.setCompoundDrawablesWithIntrinsicBounds(R.drawable.widget_config_fridge, 0, 0, 0);
            option.setCompoundDrawablePadding(getResources().getDimensionPixelSize(
                    R.dimen.widget_config_choice_indicator_gap));
            option.setTextColor(getColor(R.color.widget_ink));
            option.setTypeface(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD);
            option.setStateListAnimator(null);
            RadioGroup.LayoutParams params = new RadioGroup.LayoutParams(
                    RadioGroup.LayoutParams.MATCH_PARENT,
                    RadioGroup.LayoutParams.WRAP_CONTENT);
            params.setMargins(0, getResources().getDimensionPixelSize(
                    R.dimen.widget_config_choice_gap), 0, 0);
            option.setLayoutParams(params);
            choices.addView(option);
            if (existing != null && existing.fridgeId.equals(summary.getId())) option.setChecked(true);
        }
    }

    private void saveSelection() {
        int checkedId = choices.getCheckedRadioButtonId();
        if (checkedId == -1) {
            Toast.makeText(this, R.string.widget_choose_fridge, Toast.LENGTH_SHORT).show();
            return;
        }
        RadioButton selected = findViewById(checkedId);
        String fridgeId = String.valueOf(selected.getTag());
        RecipeWidgetModels.FridgeSummary summary = findSummary(fridgeId);
        if (summary == null) return;
        RecipeWidgetRepository repository = new RecipeWidgetRepository(this);
        repository.saveWidgetConfig(new RecipeWidgetModels.WidgetConfig(
                widgetId, summary.getId(), summary.getAccessRole(), 0));
        RecipeWidgetModels.Snapshot cached = repository.getSnapshotModel(
                repository.getAccountGeneration(), summary.getId(), RecipeWidgetRules.weekStart());
        repository.setWidgetState(widgetId, cached == null ? "loading" : "idle");
        RecipeWidgetProvider.refreshWidget(this, widgetId);
        if (!RecipeWidgetWorkScheduler.enqueueRefresh(this, widgetId) && cached == null) {
            repository.setWidgetState(widgetId, "failed");
            RecipeWidgetProvider.refreshWidget(this, widgetId);
        }
        Intent result = new Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        setResult(RESULT_OK, result);
        finish();
    }

    private RecipeWidgetModels.FridgeSummary findSummary(String id) {
        for (RecipeWidgetModels.FridgeSummary summary : summaries) {
            if (summary.getId().equals(id)) return summary;
        }
        return null;
    }

    private List<RecipeWidgetModels.FridgeSummary> listSummaries() {
        return new RecipeWidgetRepository(this).listFridgeSummaries();
    }
}
