package com.fridgeboard.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** Pure state mapping tests for terminal and recoverable widget work outcomes. */
public class RecipeWidgetAndroidWorkerTest {
    @Test
    public void staleGenerationRemainsLoadingForTheReplacementRefresh() {
        assertEquals("loading", RecipeWidgetAndroidWorker.stateForOutcome(
                RecipeWidgetWorker.Outcome.Code.STALE_GENERATION,
                RecipeWidgetApiClient.ErrorCode.NONE));
        assertEquals("failed", RecipeWidgetAndroidWorker.stateForOutcome(
                RecipeWidgetWorker.Outcome.Code.STALE_GENERATION,
                RecipeWidgetApiClient.ErrorCode.NONE, true));
    }

    @Test
    public void networkFailureUsesOfflineWhileOtherFailuresAreActionable() {
        assertEquals("offline", RecipeWidgetAndroidWorker.stateForOutcome(
                RecipeWidgetWorker.Outcome.Code.FAILED,
                RecipeWidgetApiClient.ErrorCode.TIMEOUT));
        assertEquals("failed", RecipeWidgetAndroidWorker.stateForOutcome(
                RecipeWidgetWorker.Outcome.Code.FAILED,
                RecipeWidgetApiClient.ErrorCode.INVALID_RESPONSE));
        assertEquals("auth_expired", RecipeWidgetAndroidWorker.stateForOutcome(
                RecipeWidgetWorker.Outcome.Code.AUTH_REVOKED,
                RecipeWidgetApiClient.ErrorCode.AUTH_REJECTED));
    }
}
