package com.acme.orders.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.acme.orders.model.CustomerTier;
import com.acme.orders.model.LineItem;
import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import org.junit.jupiter.api.Test;

class PricingServiceTest {

    private final PricingService pricing = new PricingService();

    private static List<LineItem> items(String... prices) {
        LineItem[] list = new LineItem[prices.length];
        for (int i = 0; i < prices.length; i++) {
            list[i] = new LineItem("SKU-" + i, "Item " + i, 1, new BigDecimal(prices[i]));
        }
        return Arrays.asList(list);
    }

    @Test
    void subtotalAddsLineTotals() {
        List<LineItem> lines = Arrays.asList(new LineItem("A", "A", 3, new BigDecimal("2.50")), new LineItem("B", "B", 1, new BigDecimal("4.00")));
        assertEquals(new BigDecimal("11.50"), pricing.subtotal(lines));
    }

    @Test
    void goldGetsTenPercent() {
        assertEquals(new BigDecimal("10.00"), pricing.discount(CustomerTier.GOLD, new BigDecimal("100.00")));
    }

    @Test
    void silverGetsFivePercent() {
        assertEquals(new BigDecimal("5.00"), pricing.discount(CustomerTier.SILVER, new BigDecimal("100.00")));
    }

    @Test
    void standardGetsNothingBelowTheBulkThreshold() {
        assertEquals(new BigDecimal("0.00"), pricing.discount(CustomerTier.STANDARD, pricing.subtotal(items("120.00", "80.00"))));
    }

    @Test
    void bulkOrdersGetOneExtraPoint() {
        assertEquals(new BigDecimal("5.00"), pricing.discount(CustomerTier.STANDARD, new BigDecimal("500.00")));
        assertEquals(new BigDecimal("55.00"), pricing.discount(CustomerTier.GOLD, new BigDecimal("500.00")));
    }

    @Test
    void parsesTiersLeniently() {
        assertEquals(CustomerTier.GOLD, pricing.parseTier(" gold "));
        assertEquals(CustomerTier.STANDARD, pricing.parseTier(null));
        assertEquals(CustomerTier.STANDARD, pricing.parseTier(""));
        assertEquals(CustomerTier.STANDARD, pricing.parseTier("platinum"));
    }
}
