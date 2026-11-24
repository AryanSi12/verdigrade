package com.acme.orders.dto;

import java.util.Map;

public class ApiError {

    private final int status;
    private final String message;
    private final Map<String, String> fields;

    public ApiError(int status, String message, Map<String, String> fields) {
        this.status = status;
        this.message = message;
        this.fields = fields;
    }

    public int getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }

    public Map<String, String> getFields() {
        return fields;
    }
}
