package com.fridgeboard.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Pure contract checks for the widget API client's URL boundary. */
public class RecipeWidgetApiClientTest {
    @Test public void apiOriginIsHttpsAndPathEncodingIsUrlSafeOnApi24() {
        assertTrue(RecipeWidgetApiClient.API_ORIGIN.startsWith("https://"));
        assertEquals("a%20b%2Fc", RecipeWidgetApiClient.encode("a b/c"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void missingDependenciesAreRejectedBeforeNetwork() {
        new RecipeWidgetApiClient(null, null);
    }
}
