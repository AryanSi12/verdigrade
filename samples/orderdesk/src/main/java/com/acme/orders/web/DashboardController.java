package com.acme.orders.web;

import com.acme.orders.dto.DashboardStats;
import com.acme.orders.runtime.RuntimeInfo;
import com.acme.orders.service.ReportService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class DashboardController {

    @Autowired
    private ReportService reports;

    @GetMapping("/dashboard")
    public DashboardStats dashboard() {
        return reports.dashboard();
    }

    @GetMapping("/runtime")
    public RuntimeInfo runtime() {
        return RuntimeInfo.read(getClass().getClassLoader());
    }

    @GetMapping("/export")
    public ResponseEntity<String> export() {
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=orders.csv")
            .contentType(new MediaType("text", "csv"))
            .body(reports.csv());
    }
}
