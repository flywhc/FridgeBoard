package com.fridgeboard.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Unit tests for monotonic recipe snapshot acceptance. */
public class RecipeWidgetRepositoryTest {
    @Test
    public void newerSnapshotReplacesExistingSnapshot() {
        assertTrue(RecipeWidgetRepository.shouldReplaceSnapshot(100L, 200L));
    }

    @Test
    public void lateOlderSnapshotIsRejected() {
        assertFalse(RecipeWidgetRepository.shouldReplaceSnapshot(200L, 100L));
    }

    @Test
    public void equalTimestampIsAccepted() {
        assertTrue(RecipeWidgetRepository.shouldReplaceSnapshot(200L, 200L));
    }

}
