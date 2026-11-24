package com.acme.board.dto;

import java.util.ArrayList;
import java.util.List;

/** The body of every 4xx answer from the API: a status, a message and (for validation) the fields. */
public class ApiError {

    private final int status;
    private final String message;
    private final List<FieldProblem> errors = new ArrayList<>();

    public ApiError(int status, String message) {
        this.status = status;
        this.message = message;
    }

    public ApiError add(String field, String message) {
        errors.add(new FieldProblem(field, message));
        return this;
    }

    public int getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }

    public List<FieldProblem> getErrors() {
        return errors;
    }

    public static final class FieldProblem {
        private final String field;
        private final String message;

        FieldProblem(String field, String message) {
            this.field = field;
            this.message = message;
        }

        public String getField() {
            return field;
        }

        public String getMessage() {
            return message;
        }
    }
}
