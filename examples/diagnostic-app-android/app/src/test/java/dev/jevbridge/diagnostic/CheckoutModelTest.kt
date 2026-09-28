package dev.jevbridge.diagnostic

import org.junit.Assert.assertEquals
import org.junit.Test

class CheckoutModelTest {
    /** Intentionally red until the planted total bug is fixed, like the iOS app's test. */
    @Test
    fun twoItemsShowTheirSum() {
        val checkout = CheckoutModel().add(SampleItem.Apple).add(SampleItem.Bread)
        assertEquals(500, checkout.totalCents)
    }
}
