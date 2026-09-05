package com.fridgeboard.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

import javax.net.ssl.HttpsURLConnection;

/** Small HTTPS client for the existing owner/daily recipe endpoints. */
public final class RecipeWidgetApiClient {
    public static final String API_ORIGIN = "https://fridge.flycn.fyi";
    public static final int CONNECT_TIMEOUT_MS = 15_000;
    public static final int READ_TIMEOUT_MS = 20_000;
    private static final int MAX_RESPONSE_BYTES = 1_048_576;
    private static final Object REFRESH_LOCK = new Object();

    /** Structured safe state returned to UI/Worker code; it never contains credentials. */
    public enum ErrorCode {
        NONE, NO_CREDENTIAL, NETWORK, TIMEOUT, HTTP, INVALID_RESPONSE,
        AUTH_REJECTED, ACCESS_REVOKED, STORAGE
    }

    /** Result of one API call. Response JSON is available only on success. */
    public static final class Result {
        public final boolean success;
        public final int statusCode;
        public final ErrorCode errorCode;
        public final String message;
        public final String responseJson;

        private Result(boolean success, int statusCode, ErrorCode errorCode,
                       String message, String responseJson) {
            this.success = success;
            this.statusCode = statusCode;
            this.errorCode = errorCode;
            this.message = message;
            this.responseJson = responseJson;
        }

        static Result success(int statusCode, String responseJson) {
            return new Result(true, statusCode, ErrorCode.NONE, null, responseJson);
        }

        static Result failure(int statusCode, ErrorCode code, String message) {
            return new Result(false, statusCode, code, message, null);
        }
    }

    interface ConnectionFactory {
        HttpURLConnection open(URL url) throws IOException;
    }

    private final SecureSessionStore sessionStore;
    private final ConnectionFactory connectionFactory;
    private final RecipeWidgetDiagnostics diagnostics;

    /** Creates a client using the fixed production API origin. */
    public RecipeWidgetApiClient(SecureSessionStore sessionStore) {
        this(sessionStore, url -> (HttpURLConnection) url.openConnection());
    }

    RecipeWidgetApiClient(SecureSessionStore sessionStore, ConnectionFactory connectionFactory) {
        if (sessionStore == null || connectionFactory == null) throw new IllegalArgumentException("dependencies are required");
        this.sessionStore = sessionStore;
        this.connectionFactory = connectionFactory;
        this.diagnostics = new RecipeWidgetDiagnostics(sessionStore.appContext());
    }

    /** Fetches one normalized week using the credential selected by access role. */
    public Result fetchRecipes(String refrigeratorId, String accessRole, String weekStart) {
        requireArgs(refrigeratorId, accessRole, weekStart);
        String path = "/api/" + route(accessRole) + "/refrigerators/" + encode(refrigeratorId)
                + "/recipes?week_start=" + encode(weekStart);
        return request("GET", path, accessRole, refrigeratorId, null, true);
    }

    /** Completes one entry; the caller should fetch the full week after this call. */
    public Result complete(String refrigeratorId, String accessRole, String entryId) {
        return action("complete", refrigeratorId, accessRole, entryId);
    }

    /** Undoes one entry; the caller should fetch the full week after this call. */
    public Result undo(String refrigeratorId, String accessRole, String entryId) {
        return action("undo", refrigeratorId, accessRole, entryId);
    }

    /** Refreshes the owner session once and stores the rotated pair in encrypted storage. */
    public Result refreshOwnerSession() {
        return refreshOwnerSession(null);
    }

    private Result refreshOwnerSession(String rejectedAccessToken) {
        synchronized (REFRESH_LOCK) {
            try {
                // Re-read after acquiring the process lock: another fridge may have rotated the pair.
                String raw = sessionStore.get(SecureSessionStore.SESSION_KEY);
                if (raw == null) return Result.failure(0, ErrorCode.NO_CREDENTIAL, "owner session is missing");
                JSONObject session = new JSONObject(raw);
                String currentAccessToken = session.optString("accessToken", "");
                if (rejectedAccessToken != null && !rejectedAccessToken.equals(currentAccessToken)) {
                    return Result.success(200, "{}");
                }
                String refreshToken = session.optString("refreshToken", "");
                if (refreshToken.isEmpty()) return Result.failure(0, ErrorCode.STORAGE, "owner session is invalid");
                JSONObject payload = new JSONObject().put("refresh_token", refreshToken);
                Result result = request("POST", "/api/auth/mobile/refresh", "owner", null,
                        payload.toString(), false);
                if (!result.success) return result;
                JSONObject response = new JSONObject(result.responseJson);
                String accessToken = response.optString("access_token", "");
                String rotatedRefresh = response.optString("refresh_token", "");
                if (accessToken.isEmpty() || rotatedRefresh.isEmpty()) {
                    return Result.failure(result.statusCode, ErrorCode.INVALID_RESPONSE, "refresh response is invalid");
                }
                sessionStore.set(SecureSessionStore.SESSION_KEY, new JSONObject()
                        .put("accessToken", accessToken).put("refreshToken", rotatedRefresh).toString());
                return result;
            } catch (JSONException exception) {
                return Result.failure(0, ErrorCode.STORAGE, "owner session is invalid");
            } catch (Exception exception) {
                return Result.failure(0, SecureSessionStore.isRecoverableKeyFailure(exception)
                        ? ErrorCode.STORAGE : ErrorCode.NETWORK, "owner session could not be refreshed");
            }
        }
    }

    private Result action(String operation, String refrigeratorId, String accessRole, String entryId) {
        requireArgs(refrigeratorId, accessRole, entryId);
        String path = "/api/" + route(accessRole) + "/refrigerators/" + encode(refrigeratorId)
                + "/recipes/" + encode(entryId) + "/" + operation;
        return request("POST", path, accessRole, refrigeratorId, null, true);
    }

    private Result request(String method, String path, String accessRole, String refrigeratorId,
                           String body, boolean retryOwner401) {
        String token;
        try {
            token = "owner".equals(accessRole) ? ownerAccessToken() : deviceToken(refrigeratorId);
        } catch (Exception exception) {
            return Result.failure(0, ErrorCode.STORAGE, "credential storage could not be read");
        }
        if (token == null || token.isEmpty()) {
            return Result.failure(0, ErrorCode.NO_CREDENTIAL, "credential is missing");
        }
        Result result = send(method, path, token, body);
        if (retryOwner401 && "owner".equals(accessRole) && result.statusCode == 401) {
            Result refreshed = refreshOwnerSession(token);
            if (!refreshed.success) return refreshed;
            try {
                String nextToken = ownerAccessToken();
                return send(method, path, nextToken, body);
            } catch (Exception exception) {
                return Result.failure(0, ErrorCode.STORAGE, "credential storage could not be read");
            }
        }
        return result;
    }

    private String ownerAccessToken() throws Exception {
        String raw = sessionStore.get(SecureSessionStore.SESSION_KEY);
        if (raw == null) return null;
        return new JSONObject(raw).optString("accessToken", "");
    }

    private String deviceToken(String refrigeratorId) throws Exception {
        String raw = sessionStore.get(SecureSessionStore.DEVICE_TOKENS_KEY);
        if (raw == null) return null;
        JSONArray tokens = new JSONArray(raw);
        for (int index = 0; index < tokens.length(); index++) {
            JSONObject item = tokens.optJSONObject(index);
            if (item != null && refrigeratorId.equals(item.optString("refrigeratorId", ""))) {
                String token = item.optString("token", "");
                return token.isEmpty() ? null : token;
            }
        }
        return null;
    }

    private Result send(String method, String path, String token, String body) {
        HttpURLConnection connection = null;
        long startedAt = System.currentTimeMillis();
        try {
            URL url = new URL(API_ORIGIN + path);
            if (!"https".equalsIgnoreCase(url.getProtocol()) || !API_ORIGIN.equals(
                    url.getProtocol() + "://" + url.getHost())) {
                return Result.failure(0, ErrorCode.NETWORK, "API origin is not trusted");
            }
            connection = connectionFactory.open(url);
            if (!(connection instanceof HttpsURLConnection)) {
                return Result.failure(0, ErrorCode.NETWORK, "HTTPS connection is required");
            }
            connection.setRequestMethod(method);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            connection.setUseCaches(false);
            connection.setDoInput(true);
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("Authorization", "Bearer " + token);
            if (body != null) {
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.getOutputStream().write(body.getBytes(StandardCharsets.UTF_8));
            }
            int status = connection.getResponseCode();
            String response = readBody(status >= 400 ? connection.getErrorStream() : connection.getInputStream());
            if (status >= 200 && status < 300) return Result.success(status, response);
            diagnostics.httpFailure(method, path, status, System.currentTimeMillis() - startedAt,
                    connection.getContentType(), response, null);
            ErrorCode code = status == 401 || status == 403 ? ErrorCode.AUTH_REJECTED : ErrorCode.HTTP;
            return Result.failure(status, code, "API request failed");
        } catch (java.net.SocketTimeoutException exception) {
            diagnostics.httpFailure(method, path, 0, System.currentTimeMillis() - startedAt,
                    connection == null ? null : connection.getContentType(), null, exception);
            return Result.failure(0, ErrorCode.TIMEOUT, "API request timed out");
        } catch (IOException exception) {
            diagnostics.httpFailure(method, path, 0, System.currentTimeMillis() - startedAt,
                    connection == null ? null : connection.getContentType(), null, exception);
            return Result.failure(0, ErrorCode.NETWORK, "API request could not be completed");
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readBody(InputStream input) throws IOException {
        if (input == null) return "";
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int total = 0;
            int count;
            while ((count = stream.read(buffer)) != -1) {
                total += count;
                if (total > MAX_RESPONSE_BYTES) throw new IOException("response too large");
                output.write(buffer, 0, count);
            }
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }

    private static String route(String role) {
        if ("owner".equals(role)) return "owner";
        if ("daily_access".equals(role)) return "daily";
        throw new IllegalArgumentException("accessRole is invalid");
    }

    static String encode(String value) {
        try {
            return URLEncoder.encode(value, "UTF-8").replace("+", "%20");
        } catch (java.io.UnsupportedEncodingException impossible) {
            throw new AssertionError(impossible);
        }
    }

    private static void requireArgs(String refrigeratorId, String accessRole, String value) {
        if (refrigeratorId == null || refrigeratorId.isEmpty()
                || accessRole == null || value == null || value.isEmpty()) {
            throw new IllegalArgumentException("recipe API arguments are required");
        }
        route(accessRole);
    }
}
