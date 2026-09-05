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

    /** Returns the number of visible rows supported by a widget's measured height. */
    public static int rowsForHeight(int heightDp) {
        if (heightDp < 220) return 1;
        if (heightDp < 300) return 2;
        return 3;
    }

    /** Returns the number of pages, with one empty page for an empty widget. */
    public static int pageCount(int totalEntries, int rowsPerPage) {
        if (totalEntries < 0) throw new IllegalArgumentException("totalEntries must be non-negative");
        if (rowsPerPage <= 0) throw new IllegalArgumentException("rowsPerPage must be positive");
        long pages = ((long) totalEntries + rowsPerPage - 1L) / rowsPerPage;
        return (int) Math.max(1L, pages);
    }

    /** Returns the number of pages for a list and measured widget height. */
    public static int pageCount(List<RecipeWidgetModels.Entry> entries, int heightDp) {
        return pageCount(entries == null ? 0 : entries.size(), rowsForHeight(heightDp));
    }

    /** Restricts a requested page to the valid page range. */
    public static int clampPage(int pageIndex, int pageCount) {
        if (pageCount <= 0) return 0;
        return Math.max(0, Math.min(pageIndex, pageCount - 1));
    }

    /** Returns a stable, immutable page slice. */
    public static List<RecipeWidgetModels.Entry> pageSlice(List<RecipeWidgetModels.Entry> entries,
                                                            int pageIndex, int rowsPerPage) {
        if (rowsPerPage <= 0) throw new IllegalArgumentException("rowsPerPage must be positive");
        if (entries == null || entries.isEmpty()) return Collections.emptyList();
        int pages = pageCount(entries.size(), rowsPerPage);
        int page = clampPage(pageIndex, pages);
        int start = Math.min(entries.size(), page * rowsPerPage);
        int end = Math.min(entries.size(), start + rowsPerPage);
        return Collections.unmodifiableList(new ArrayList<>(entries.subList(start, end)));
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
