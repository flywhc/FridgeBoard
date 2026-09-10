package com.fridgeboard.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Pure state mapping tests for terminal and recoverable widget work outcomes. */
public class RecipeWidgetAndroidWorkerTest {
    @Test
    public void quantityTextDropsFloatingPointNoise() {
        assertEquals("1", RecipeWidgetWorker.quantityText(1.0));
        assertEquals("2", RecipeWidgetWorker.quantityText(2.0));
        assertEquals("1.25", RecipeWidgetWorker.quantityText(1.25));
    }

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

    @Test
    public void successfulActionDoesNotRedrawButChangedRefreshDoes() {
        assertFalse(RecipeWidgetAndroidWorker.shouldRedrawAfterOutcome(
                outcome(RecipeWidgetWorker.Outcome.Code.UPDATED, true), true));
        assertTrue(RecipeWidgetAndroidWorker.shouldRedrawAfterOutcome(
                outcome(RecipeWidgetWorker.Outcome.Code.UPDATED, true), false));
        assertFalse(RecipeWidgetAndroidWorker.shouldRedrawAfterOutcome(
                outcome(RecipeWidgetWorker.Outcome.Code.NOOP, false), false));
        assertTrue(RecipeWidgetAndroidWorker.shouldRedrawAfterOutcome(
                outcome(RecipeWidgetWorker.Outcome.Code.FAILED, false), true));
    }

    private static RecipeWidgetWorker.Outcome outcome(RecipeWidgetWorker.Outcome.Code code,
                                                       boolean snapshotUpdated) {
        return new RecipeWidgetWorker.Outcome(code, RecipeWidgetApiClient.ErrorCode.NONE, 200,
                snapshotUpdated);
    }
}
