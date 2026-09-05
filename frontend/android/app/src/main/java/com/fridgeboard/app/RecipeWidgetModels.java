package com.fridgeboard.app;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Immutable data exchanged by the recipe widget's persistence and sync layers. */
public final class RecipeWidgetModels {
    /** Maximum size of a single text value accepted by the widget boundary. */
    public static final int MAX_TEXT_LENGTH = 256;
    /** Maximum number of recipes or ingredients accepted in one payload. */
    public static final int MAX_ENTRIES = 128;
    public static final int MAX_INGREDIENTS = 64;
    /** Maximum serialized payload size, in UTF-16 code units. */
    public static final int MAX_JSON_LENGTH = 64 * 1024;

    private RecipeWidgetModels() {
    }

    /** A refrigerator that can be selected for a widget instance. */
    public static final class FridgeSummary {
        private final String id;
        private final String name;
        private final String accessRole;

        public FridgeSummary(String id, String name, String accessRole) {
            this.id = required(id, "id");
            this.name = required(name, "name");
            this.accessRole = role(accessRole);
        }

        public String getId() { return id; }
        public String getName() { return name; }
        public String getAccessRole() { return accessRole; }

        public String toJson() {
            return object("id", id, "name", name, "accessRole", accessRole);
        }

        public static FridgeSummary fromJson(String json) {
            Map<String, Object> map = Json.object(json);
            return new FridgeSummary(Json.text(map, "id", true), Json.text(map, "name", true),
                    Json.text(map, "accessRole", true));
        }
    }

    /** Display-ready information for one recipe ingredient. */
    public static final class IngredientDisplay {
        private final String name;
        private final String quantity;
        private final String unit;
        private final boolean missing;
        private final String rawDisplayText;

        public IngredientDisplay(String name, String quantity, String unit, boolean missing) {
            this.name = required(name, "name");
            this.quantity = optional(quantity, "quantity");
            this.unit = optional(unit, "unit");
            this.missing = missing;
            this.rawDisplayText = null;
        }

        public IngredientDisplay(String name, String displayText) {
            this.name = required(name, "name");
            this.quantity = null;
            this.unit = null;
            this.missing = false;
            this.rawDisplayText = bounded(displayText == null ? "" : displayText, "displayText");
        }

        public IngredientDisplay(String name, String displayText, boolean missing) {
            this.name = required(name, "name");
            this.quantity = null;
            this.unit = null;
            this.missing = missing;
            this.rawDisplayText = bounded(displayText == null ? "" : displayText, "displayText");
        }

        private IngredientDisplay(String displayText, boolean missing) {
            this.name = null;
            this.quantity = null;
            this.unit = null;
            this.missing = missing;
            this.rawDisplayText = bounded(displayText, "displayText");
        }

        /** Creates an ingredient that is already formatted by the web bridge. */
        public static IngredientDisplay preformatted(String displayText) {
            if (displayText == null || displayText.isEmpty()) {
                throw new IllegalArgumentException("displayText is required");
            }
            return new IngredientDisplay(displayText, false);
        }

        public String getName() { return name; }
        public String getQuantity() { return quantity; }
        public String getUnit() { return unit; }
        public boolean isMissing() { return missing; }

        /** Returns the quantity-aware label used in a compact widget row. */
        public String getDisplayText() {
            if (rawDisplayText != null) return rawDisplayText;
            if (quantity == null || quantity.isEmpty()) return name;
            return unit == null || unit.isEmpty() ? name + " × " + quantity : name + " × " + quantity + unit;
        }

        public String toJson() {
            StringBuilder json = new StringBuilder("{\"name\":");
            if (name == null) json.append("null"); else Json.quote(json, name);
            json.append(",\"quantity\":");
            if (quantity == null) json.append("null"); else Json.quote(json, quantity);
            json.append(",\"unit\":");
            if (unit == null) json.append("null"); else Json.quote(json, unit);
            json.append(",\"missing\":").append(missing);
            if (rawDisplayText != null) {
                json.append(",\"displayText\":"); Json.quote(json, rawDisplayText);
            }
            json.append('}');
            return json.toString();
        }

        public static IngredientDisplay fromJson(String json) {
            Map<String, Object> map = Json.object(json);
            return fromMap(map);
        }

        private static IngredientDisplay fromMap(Map<String, Object> map) {
            String displayText = Json.text(map, "displayText", false);
            if (displayText != null) {
                String name = Json.text(map, "name", false);
                return name == null
                        ? new IngredientDisplay(displayText, Json.bool(map, "missing", false))
                        : new IngredientDisplay(name, displayText, Json.bool(map, "missing", false));
            }
            return new IngredientDisplay(Json.text(map, "name", true), Json.text(map, "quantity", false),
                    Json.text(map, "unit", false), Json.bool(map, "missing", false));
        }
    }

    /** One recipe row, already reduced to the information a widget needs. */
    public static final class Entry {
        private final String id;
        private final int weekday;
        private final String label;
        private final String dishName;
        private final List<IngredientDisplay> ingredientsDisplay;
        private final boolean completed;
        private final int missingCount;
        private final boolean pending;

        public Entry(String id, int weekday, String label, String dishName,
                     List<IngredientDisplay> ingredientsDisplay, boolean completed,
                     int missingCount, boolean pending) {
            this.id = required(id, "id");
            if (weekday < 0 || weekday > 6) throw new IllegalArgumentException("weekday must be 0..6");
            this.weekday = weekday;
            this.label = required(label, "label");
            this.dishName = required(dishName, "dishName");
            this.ingredientsDisplay = ingredients(ingredientsDisplay);
            if (missingCount < 0) throw new IllegalArgumentException("missingCount must be non-negative");
            this.missingCount = missingCount;
            this.completed = completed;
            this.pending = pending;
        }

        /** Creates an entry from a preformatted ingredient string received from the web bridge. */
        public Entry(String id, int weekday, String label, String dishName,
                     String ingredientsDisplay, boolean completed, int missingCount, boolean pending) {
            this(id, weekday, label, dishName, preformattedIngredients(ingredientsDisplay), completed,
                    missingCount, pending);
        }

        public String getId() { return id; }
        public int getWeekday() { return weekday; }
        public String getLabel() { return label; }
        public String getDishName() { return dishName; }
        public List<IngredientDisplay> getIngredientsDisplay() { return ingredientsDisplay; }
        /** Returns the display form used when a consumer needs one compact text value. */
        public String getIngredientsDisplayText() {
            return RecipeWidgetRules.formatIngredients(ingredientsDisplay);
        }
        public boolean isCompleted() { return completed; }
        public int getMissingCount() { return missingCount; }
        public boolean isPending() { return pending; }

        public String toJson() {
            StringBuilder json = new StringBuilder("{\"id\":");
            Json.quote(json, id);
            json.append(",\"weekday\":").append(weekday).append(",\"label\":");
            Json.quote(json, label);
            json.append(",\"dishName\":");
            Json.quote(json, dishName);
            json.append(",\"ingredientsDisplay\":[");
            for (int i = 0; i < ingredientsDisplay.size(); i++) {
                if (i > 0) json.append(',');
                json.append(ingredientsDisplay.get(i).toJson());
            }
            return json.append("],\"completed\":").append(completed)
                    .append(",\"missingCount\":").append(missingCount)
                    .append(",\"pending\":").append(pending).append('}').toString();
        }

        public static Entry fromJson(String json) {
            return fromMap(Json.object(json));
        }

        private static Entry fromMap(Map<String, Object> map) {
            List<Object> raw = Json.array(map, "ingredientsDisplay", false);
            List<IngredientDisplay> ingredients = new ArrayList<>();
            if (raw != null) {
                if (raw.size() > MAX_INGREDIENTS) throw new IllegalArgumentException("too many ingredients");
                for (Object item : raw) {
                    if (!(item instanceof Map)) throw new IllegalArgumentException("invalid ingredient");
                    ingredients.add(IngredientDisplay.fromMap(Json.map(item)));
                }
            }
            return new Entry(Json.text(map, "id", true), Json.integer(map, "weekday", true),
                    Json.text(map, "label", true), Json.text(map, "dishName", true), ingredients,
                    Json.bool(map, "completed", false), Json.integer(map, "missingCount", false),
                    Json.bool(map, "pending", false));
        }
    }

    /** Persisted result of a widget data fetch. */
    public static final class Snapshot {
        private final long accountGeneration;
        private final String fridgeId;
        private final String fridgeName;
        private final String accessRole;
        private final String weekStart;
        private final long capturedAt;
        private final List<Entry> entries;
        private final String status;
        private final String error;

        public Snapshot(long accountGeneration, String fridgeId, String fridgeName, String accessRole,
                        String weekStart, long capturedAt, List<Entry> entries, String status, String error) {
            if (accountGeneration < 0) throw new IllegalArgumentException("accountGeneration must be non-negative");
            this.accountGeneration = accountGeneration;
            this.fridgeId = required(fridgeId, "fridgeId");
            this.fridgeName = required(fridgeName, "fridgeName");
            this.accessRole = role(accessRole);
            this.weekStart = required(weekStart, "weekStart");
            if (!RecipeWidgetRules.isMondayDate(this.weekStart)) {
                throw new IllegalArgumentException("weekStart must be a valid Monday YYYY-MM-DD");
            }
            if (capturedAt < 0) throw new IllegalArgumentException("capturedAt must be non-negative");
            this.capturedAt = capturedAt;
            if (entries == null) entries = Collections.emptyList();
            if (entries.size() > MAX_ENTRIES) throw new IllegalArgumentException("too many entries");
            this.entries = Collections.unmodifiableList(new ArrayList<>(entries));
            this.status = status(status);
            this.error = optional(error, "error");
        }

        public long getAccountGeneration() { return accountGeneration; }
        public String getFridgeId() { return fridgeId; }
        public String getFridgeName() { return fridgeName; }
        public String getAccessRole() { return accessRole; }
        public String getWeekStart() { return weekStart; }
        public long getCapturedAt() { return capturedAt; }
        public List<Entry> getEntries() { return entries; }
        public String getStatus() { return status; }
        public String getError() { return error; }

        public String toJson() {
            StringBuilder json = new StringBuilder("{\"accountGeneration\":").append(accountGeneration);
            json.append(",\"fridgeId\":"); Json.quote(json, fridgeId);
            json.append(",\"fridgeName\":"); Json.quote(json, fridgeName);
            json.append(",\"accessRole\":"); Json.quote(json, accessRole);
            json.append(",\"weekStart\":"); Json.quote(json, weekStart);
            json.append(",\"capturedAt\":").append(capturedAt).append(",\"entries\":[");
            for (int i = 0; i < entries.size(); i++) {
                if (i > 0) json.append(',');
                json.append(entries.get(i).toJson());
            }
            json.append("],\"status\":"); Json.quote(json, status);
            json.append(",\"error\":");
            if (error == null) json.append("null"); else Json.quote(json, error);
            return json.append('}').toString();
        }

        public static Snapshot fromJson(String json) {
            Map<String, Object> map = Json.object(json);
            List<Object> raw = Json.array(map, "entries", true);
            List<Entry> entries = new ArrayList<>();
            if (raw != null) {
                if (raw.size() > MAX_ENTRIES) throw new IllegalArgumentException("too many entries");
                for (Object item : raw) {
                    if (!(item instanceof Map)) throw new IllegalArgumentException("invalid entry");
                    entries.add(Entry.fromMap(Json.map(item)));
                }
            }
            return new Snapshot(Json.longValue(map, "accountGeneration", true),
                    Json.text(map, "fridgeId", true), Json.text(map, "fridgeName", true),
                    Json.text(map, "accessRole", true), Json.text(map, "weekStart", true),
                    Json.longValue(map, "capturedAt", true), entries, Json.text(map, "status", true),
                    Json.text(map, "error", false));
        }
    }

    /** Per-instance binding and current page. */
    public static final class WidgetConfig {
        private final int widgetId;
        private final String fridgeId;
        private final String accessRole;
        private final int pageIndex;

        public WidgetConfig(int widgetId, String fridgeId, String accessRole, int pageIndex) {
            if (widgetId < 0) throw new IllegalArgumentException("widgetId must be non-negative");
            if (pageIndex < 0) throw new IllegalArgumentException("pageIndex must be non-negative");
            this.widgetId = widgetId;
            this.fridgeId = required(fridgeId, "fridgeId");
            this.accessRole = role(accessRole);
            this.pageIndex = pageIndex;
        }

        public int getWidgetId() { return widgetId; }
        public String getFridgeId() { return fridgeId; }
        public String getAccessRole() { return accessRole; }
        public int getPageIndex() { return pageIndex; }

        public String toJson() {
            return "{\"widgetId\":" + widgetId + ",\"fridgeId\":" + quoted(fridgeId)
                    + ",\"accessRole\":" + quoted(accessRole) + ",\"pageIndex\":" + pageIndex + '}';
        }

        public static WidgetConfig fromJson(String json) {
            Map<String, Object> map = Json.object(json);
            return new WidgetConfig(Json.integer(map, "widgetId", true), Json.text(map, "fridgeId", true),
                    Json.text(map, "accessRole", true), Json.integer(map, "pageIndex", false));
        }
    }

    private static List<IngredientDisplay> ingredients(List<IngredientDisplay> value) {
        if (value == null) return Collections.emptyList();
        if (value.size() > MAX_INGREDIENTS) throw new IllegalArgumentException("too many ingredients");
        for (IngredientDisplay ingredient : value) if (ingredient == null) throw new IllegalArgumentException("null ingredient");
        return Collections.unmodifiableList(new ArrayList<>(value));
    }

    private static List<IngredientDisplay> preformattedIngredients(String value) {
        if (value == null || value.isEmpty()) return Collections.emptyList();
        return Collections.singletonList(IngredientDisplay.preformatted(value));
    }

    private static String required(String value, String field) {
        if (value == null || value.trim().isEmpty()) throw new IllegalArgumentException(field + " is required");
        return bounded(value, field);
    }

    private static String optional(String value, String field) {
        return value == null ? null : bounded(value, field);
    }

    private static String bounded(String value, String field) {
        if (value.length() > MAX_TEXT_LENGTH) throw new IllegalArgumentException(field + " is too long");
        return value;
    }

    private static String role(String value) {
        String normalized = required(value, "accessRole");
        if (!"owner".equals(normalized) && !"daily_access".equals(normalized)) {
            throw new IllegalArgumentException("accessRole is invalid");
        }
        return normalized;
    }

    private static String status(String value) {
        String normalized = required(value, "status");
        if (!("ready".equals(normalized) || "offline".equals(normalized)
                || "failed".equals(normalized) || "auth_expired".equals(normalized)
                || "empty".equals(normalized) || "loading".equals(normalized)
                || "processing".equals(normalized))) {
            throw new IllegalArgumentException("status is invalid");
        }
        return normalized;
    }

    private static String quoted(String value) {
        StringBuilder output = new StringBuilder(); Json.quote(output, value); return output.toString();
    }

    private static String object(String key1, String value1, String key2, String value2,
                                 String key3, String value3) {
        return "{" + quoted(key1) + ":" + quoted(value1) + "," + quoted(key2) + ":" + quoted(value2)
                + "," + quoted(key3) + ":" + quoted(value3) + '}';
    }

    private static final class Json {
        static Map<String, Object> object(String source) {
            if (source == null || source.length() > MAX_JSON_LENGTH) throw new IllegalArgumentException("invalid JSON boundary");
            Object value = new Parser(source).parse();
            if (!(value instanceof Map)) throw new IllegalArgumentException("JSON object expected");
            return map(value);
        }

        @SuppressWarnings("unchecked")
        static Map<String, Object> map(Object value) { return (Map<String, Object>) value; }
        @SuppressWarnings("unchecked")
        static List<Object> array(Map<String, Object> map, String key, boolean required) {
            Object value = map.get(key);
            if (value == null) { if (required) throw new IllegalArgumentException(key + " is required"); return null; }
            if (!(value instanceof List)) throw new IllegalArgumentException(key + " must be an array");
            return (List<Object>) value;
        }
        static String text(Map<String, Object> map, String key, boolean required) {
            Object value = map.get(key);
            if (value == null) { if (required) throw new IllegalArgumentException(key + " is required"); return null; }
            if (!(value instanceof String)) throw new IllegalArgumentException(key + " must be text");
            return (String) value;
        }
        static boolean bool(Map<String, Object> map, String key, boolean required) {
            Object value = map.get(key);
            if (value == null) { if (required) throw new IllegalArgumentException(key + " is required"); return false; }
            if (!(value instanceof Boolean)) throw new IllegalArgumentException(key + " must be boolean");
            return (Boolean) value;
        }
        static int integer(Map<String, Object> map, String key, boolean required) {
            long value = longValue(map, key, required);
            if (value < Integer.MIN_VALUE || value > Integer.MAX_VALUE) throw new IllegalArgumentException(key + " is out of range");
            return (int) value;
        }
        static long longValue(Map<String, Object> map, String key, boolean required) {
            Object value = map.get(key);
            if (value == null) { if (required) throw new IllegalArgumentException(key + " is required"); return 0L; }
            if (!(value instanceof Number) || value instanceof Double || value instanceof Float) throw new IllegalArgumentException(key + " must be integer");
            return ((Number) value).longValue();
        }
        static void quote(StringBuilder output, String value) {
            output.append('"');
            for (int i = 0; i < value.length(); i++) {
                char c = value.charAt(i);
                switch (c) {
                    case '"': output.append("\\\""); break;
                    case '\\': output.append("\\\\"); break;
                    case '\n': output.append("\\n"); break;
                    case '\r': output.append("\\r"); break;
                    case '\t': output.append("\\t"); break;
                    case '\b': output.append("\\b"); break;
                    case '\f': output.append("\\f"); break;
                    default:
                        if (c < 0x20) output.append(String.format("\\u%04x", (int) c)); else output.append(c);
                }
            }
            output.append('"');
        }

        private static final class Parser {
            private final String source;
            private int position;
            Parser(String source) { this.source = source; }
            Object parse() {
                Object value = value(0); whitespace();
                if (position != source.length()) throw error("trailing JSON");
                return value;
            }
            private Object value(int depth) {
                if (depth > 16) throw error("JSON nesting is too deep");
                whitespace(); if (position >= source.length()) throw error("unexpected end");
                char c = source.charAt(position);
                if (c == '{') return object(depth + 1);
                if (c == '[') return array(depth + 1);
                if (c == '"') return string();
                if (source.startsWith("true", position)) { position += 4; return Boolean.TRUE; }
                if (source.startsWith("false", position)) { position += 5; return Boolean.FALSE; }
                if (source.startsWith("null", position)) { position += 4; return null; }
                return number();
            }
            private Map<String, Object> object(int depth) {
                position++; whitespace(); Map<String, Object> result = new LinkedHashMap<>();
                if (take('}')) return result;
                while (true) {
                    if (position >= source.length() || source.charAt(position) != '"') throw error("object key expected");
                    String key = string(); whitespace(); expect(':');
                    result.put(key, value(depth)); whitespace();
                    if (take('}')) return result; expect(','); whitespace();
                }
            }
            private List<Object> array(int depth) {
                position++; whitespace(); List<Object> result = new ArrayList<>();
                if (take(']')) return result;
                while (true) { result.add(value(depth)); whitespace(); if (take(']')) return result; expect(','); whitespace(); }
            }
            private String string() {
                expect('"'); StringBuilder result = new StringBuilder();
                while (position < source.length()) {
                    char c = source.charAt(position++); if (c == '"') return result.toString();
                    if (c != '\\') { if (c < 0x20) throw error("control character"); result.append(c); continue; }
                    if (position >= source.length()) throw error("bad escape");
                    c = source.charAt(position++);
                    switch (c) {
                        case '"': case '\\': case '/': result.append(c); break;
                        case 'b': result.append('\b'); break; case 'f': result.append('\f'); break;
                        case 'n': result.append('\n'); break; case 'r': result.append('\r'); break; case 't': result.append('\t'); break;
                        case 'u':
                            if (position + 4 > source.length()) throw error("bad unicode escape");
                            try {
                                result.append((char) Integer.parseInt(source.substring(position, position + 4), 16));
                            } catch (NumberFormatException exception) {
                                throw error("bad unicode escape");
                            }
                            position += 4;
                            break;
                        default: throw error("bad escape");
                    }
                }
                throw error("unterminated string");
            }
            private Number number() {
                int start = position; if (position < source.length() && source.charAt(position) == '-') position++;
                while (position < source.length() && Character.isDigit(source.charAt(position))) position++;
                if (start == position || (source.charAt(start) == '-' && start + 1 == position)) throw error("number expected");
                if (position < source.length() && (source.charAt(position) == '.' || source.charAt(position) == 'e' || source.charAt(position) == 'E')) throw error("integer expected");
                try { return Long.valueOf(source.substring(start, position)); } catch (NumberFormatException exception) { throw error("number out of range"); }
            }
            private void whitespace() { while (position < source.length() && Character.isWhitespace(source.charAt(position))) position++; }
            private boolean take(char expected) { if (position < source.length() && source.charAt(position) == expected) { position++; return true; } return false; }
            private void expect(char expected) { if (!take(expected)) throw error("expected '" + expected + "'"); }
            private IllegalArgumentException error(String message) { return new IllegalArgumentException(message + " at " + position); }
        }
    }
}
