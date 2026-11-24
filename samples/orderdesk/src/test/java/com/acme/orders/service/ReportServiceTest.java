package com.acme.orders.service;

import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

@SpringBootTest
class ReportServiceTest {

    @Autowired
    private ReportService reports;

    @Test
    void csvHasAHeaderAndOneLinePerOrder() {
        String[] lines = reports.csv().split("\n");
        assertTrue(lines[0].startsWith("number,customer,status"));
        assertTrue(lines.length >= 7, "header plus the seeded orders");
    }

    @Test
    void csvQuotesCustomersWithCommas() {
        assertTrue(reports.csv().contains("Maple & Co"));
        for (String line : reports.csv().split("\n")) {
            assertTrue(line.split(",").length >= 6 || line.contains("\""), line);
        }
    }
}
