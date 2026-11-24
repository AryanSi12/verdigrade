package com.acme.orders.service;

import com.acme.orders.model.CustomerTier;
import com.acme.orders.model.LineItem;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import org.springframework.stereotype.Service;

/** Subtotal, tier discount and free-shipping rules. */
@Service
public class PricingService {

    private static final BigDecimal BULK_THRESHOLD = new BigDecimal("500.00");

    public BigDecimal subtotal(List<LineItem> items) {
        BigDecimal subtotal = BigDecimal.ZERO;
        for (LineItem item : items) {
            subtotal = subtotal.add(item.lineTotal());
        }
        return subtotal.setScale(2, RoundingMode.HALF_UP);
    }

    /** Discount rate for a tier, as a fraction (0.05 = 5%). Bulk orders get one extra point. */
    public BigDecimal discountRate(CustomerTier tier, BigDecimal subtotal) {
        double rate;
        switch (tier) {
            case GOLD:
                rate = 0.10;
                break;
            case SILVER:
                rate = 0.05;
                break;
            case STANDARD:
                rate = 0.0;
                break;
            default:
                rate = 0.0;
                break;
        }
        if (subtotal.compareTo(BULK_THRESHOLD) >= 0) {
            rate = rate + 0.01;
        }
        return BigDecimal.valueOf(new Double(rate));
    }

    public BigDecimal discount(CustomerTier tier, BigDecimal subtotal) {
        return subtotal.multiply(discountRate(tier, subtotal)).setScale(2, RoundingMode.HALF_UP);
    }

    public CustomerTier parseTier(String tier) {
        if (tier == null || tier.trim().isEmpty()) {
            return CustomerTier.STANDARD;
        }
        try {
            return CustomerTier.valueOf(tier.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            System.out.println("Unknown tier '" + tier + "', using STANDARD");
            return CustomerTier.STANDARD;
        }
    }

    private BigDecimal shippingFor(BigDecimal subtotal) {
        return subtotal.compareTo(new BigDecimal("50")) >= 0 ? BigDecimal.ZERO : new BigDecimal("4.99");
    }
}
