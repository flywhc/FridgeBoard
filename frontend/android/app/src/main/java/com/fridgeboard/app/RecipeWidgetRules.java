package com.fridgeboard.app;

import java.text.SimpleDateFormat;
import java.text.ParseException;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Collections;
import java.util.Comparator;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;

/** Pure, Android-UI-free rules used to prepare recipe widget rows. */
public final class RecipeWidgetRules {
    /** Baseline height used when a launcher does not provide a usable size. */
    public static final int DEFAULT_WIDTH_DP = 250;
    public static final int DEFAULT_HEIGHT_DP = 220;
    /** A small injectable time source, used instead of java.time.Clock for API 24. */
    public interface Clock {
        long millis();
    }

    /** Supplies the current wall-clock time. */
    public static final Clock SYSTEM_CLOCK = new Clock() {
        @Override public long millis() { return System.currentTimeMillis(); }
    };

    private RecipeWidgetRules() {
    }

    /** Returns the Monday date containing the current instant in the supplied time zone. */
    public static String weekStart() {
        return weekStart(SYSTEM_CLOCK, TimeZone.getDefault());
    }

    /** Returns the Monday date containing the injected instant in the supplied time zone. */
    public static String weekStart(Clock clock, TimeZone timeZone) {
        if (clock == null || timeZone == null) throw new IllegalArgumentException("clock and timeZone are required");
        Calendar calendar = Calendar.getInstance(timeZone, Locale.US);
        calendar.setTimeInMillis(clock.millis());
        int day = calendar.get(Calendar.DAY_OF_WEEK);
        int daysFromMonday = (day + 5) % 7; // Calendar: Sunday=1, Monday=2.
        calendar.add(Calendar.DAY_OF_MONTH, -daysFromMonday);
        calendar.set(Calendar.HOUR_OF_DAY, 0);
        calendar.set(Calendar.MINUTE, 0);
        calendar.set(Calendar.SECOND, 0);
        calendar.set(Calendar.MILLISECOND, 0);
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setTimeZone(timeZone);
        return format.format(calendar.getTime());
    }

    /** Returns the Monday date containing epochMillis in the supplied time zone. */
    public static String weekStart(long epochMillis, TimeZone timeZone) {
        return weekStart(new Clock() {
            @Override public long millis() { return epochMillis; }
        }, timeZone);
    }

    /** Returns whether value is a real Gregorian calendar Monday in YYYY-MM-DD form. */
    public static boolean isMondayDate(String value) {
        if (value == null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) return false;
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setLenient(false);
        format.setTimeZone(TimeZone.getTimeZone("UTC"));
        try {
            Date parsed = format.parse(value);
            Calendar calendar = Calendar.getInstance(TimeZone.getTimeZone("UTC"), Locale.US);
            calendar.setTime(parsed);
            return calendar.get(Calendar.DAY_OF_WEEK) == Calendar.MONDAY
                    && value.equals(format.format(parsed));
        } catch (ParseException exception) {
            return false;
        }
    }

    /** Returns rows sorted by completion group and weekday while preserving equal-key order. */
    public static List<RecipeWidgetModels.Entry> sortAndFlatten(List<RecipeWidgetModels.Entry> entries) {
        if (entries == null || entries.isEmpty()) return Collections.emptyList();
        List<RecipeWidgetModels.Entry> result = new ArrayList<>();
        for (RecipeWidgetModels.Entry entry : entries) if (entry != null) result.add(entry);
        Collections.sort(result, new Comparator<RecipeWidgetModels.Entry>() {
            @Override public int compare(RecipeWidgetModels.Entry left, RecipeWidgetModels.Entry right) {
                int completion = Boolean.compare(left.isCompleted(), right.isCompleted());
                return completion != 0 ? completion : Integer.compare(left.getWeekday(), right.getWeekday());
            }
        });
        return Collections.unmodifiableList(result);
    }

    /**
     * Chooses a height from launcher-provided lower and upper bounds.
     *
     * <p>Some launchers report a portrait widget as a range whose lower bound is
     * smaller than the space actually allocated to the view.  Prefer the upper
     * bound for such ranges and retain the compact baseline so rendering is not
     * based on that lower bound.  An equal pair is an exact size and
     * is preserved for resize updates.</p>
     *
     * @param minHeightDp launcher-reported lower bound, or zero when absent
     * @param maxHeightDp launcher-reported upper bound, or zero when absent
     * @return effective height in dp
     */
    public static int effectiveHeight(int minHeightDp, int maxHeightDp) {
        int min = Math.max(0, minHeightDp);
        int max = Math.max(0, maxHeightDp);
        if (max == 0) return Math.max(DEFAULT_HEIGHT_DP, min);
        if (max > min) return Math.max(DEFAULT_HEIGHT_DP, max);
        return min > 0 ? min : max;
    }

    /**
     * Chooses a widget width from launcher-provided lower and upper bounds.
     *
     * <p>For horizontal resize ranges, the launcher reports the current narrow
     * allocation as the lower bound and the original allocation as the upper
     * bound.  Using the lower bound lets the renderer switch to the narrow
     * layout immediately after a 4×2 widget is resized to 2×2.</p>
     */
    public static int effectiveWidth(int minWidthDp, int maxWidthDp) {
        int min = Math.max(0, minWidthDp);
        int max = Math.max(0, maxWidthDp);
        if (max == 0) return Math.max(DEFAULT_WIDTH_DP, min);
        if (max > min) return min > 0 ? min : max;
        return min > 0 ? min : max;
    }

    /** Returns the number of completed entries. */
    public static int completedCount(List<RecipeWidgetModels.Entry> entries) {
        int count = 0;
        if (entries != null) for (RecipeWidgetModels.Entry entry : entries) if (entry != null && entry.isCompleted()) count++;
        return count;
    }

    /** Returns the number of non-null entries. */
    public static int totalCount(List<RecipeWidgetModels.Entry> entries) {
        int count = 0;
        if (entries != null) for (RecipeWidgetModels.Entry entry : entries) if (entry != null) count++;
        return count;
    }

    /** Returns completed and total counts as a compact immutable value. */
    public static CompletionStats completionStats(List<RecipeWidgetModels.Entry> entries) {
        return new CompletionStats(completedCount(entries), totalCount(entries));
    }

    /** Completed/total recipe counts. */
    public static final class CompletionStats {
        private final int completed;
        private final int total;
        CompletionStats(int completed, int total) { this.completed = completed; this.total = total; }
        public int getCompleted() { return completed; }
        public int getTotal() { return total; }
    }

    /** Truncates text to at most max code points, avoiding a split surrogate pair. */
    public static String truncate(String value, int maxCodePoints) {
        if (value == null) return "";
        if (maxCodePoints < 0) throw new IllegalArgumentException("maxCodePoints must be non-negative");
        int count = value.codePointCount(0, value.length());
        if (count <= maxCodePoints) return value;
        int end = value.offsetByCodePoints(0, maxCodePoints);
        return value.substring(0, end);
    }

    /** Truncates text and reserves room for an ellipsis when truncation occurs. */
    public static String truncateWithEllipsis(String value, int maxCodePoints) {
        if (value == null) return "";
        if (maxCodePoints < 1) throw new IllegalArgumentException("maxCodePoints must be positive");
        if (value.codePointCount(0, value.length()) <= maxCodePoints) return value;
        return truncate(value, maxCodePoints - 1) + "…";
    }

    /** Formats ingredients for a single compact row. */
    public static String formatIngredients(List<RecipeWidgetModels.IngredientDisplay> ingredients) {
        return formatIngredients(ingredients, Integer.MAX_VALUE);
    }

    /** Formats ingredients and caps the result at max code points. */
    public static String formatIngredients(List<RecipeWidgetModels.IngredientDisplay> ingredients, int maxCodePoints) {
        if (maxCodePoints < 0) throw new IllegalArgumentException("maxCodePoints must be non-negative");
        if (ingredients == null || ingredients.isEmpty()) return "";
        StringBuilder output = new StringBuilder();
        for (RecipeWidgetModels.IngredientDisplay ingredient : ingredients) {
            if (ingredient == null) continue;
            if (output.length() > 0) output.append("、");
            output.append(ingredient.getDisplayText());
        }
        return truncate(output.toString(), maxCodePoints);
    }

    /** Formats a missing-count suffix used by widget rows. */
    public static String formatMissingCount(int missingCount) {
        if (missingCount <= 0) return "";
        return "缺 " + missingCount;
    }
}
