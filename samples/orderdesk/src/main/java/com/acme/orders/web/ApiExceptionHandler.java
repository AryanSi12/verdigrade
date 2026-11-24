package com.acme.orders.web;

import com.acme.orders.dto.ApiError;
import com.acme.orders.service.InvalidTransitionException;
import com.acme.orders.service.OrderNotFoundException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(OrderNotFoundException.class)
    public ResponseEntity<ApiError> notFound(OrderNotFoundException e) {
        return error(HttpStatus.NOT_FOUND, e.getMessage(), null);
    }

    @ExceptionHandler({InvalidTransitionException.class, IllegalStateException.class})
    public ResponseEntity<ApiError> conflict(RuntimeException e) {
        return error(HttpStatus.CONFLICT, e.getMessage(), null);
    }

    @ExceptionHandler({IllegalArgumentException.class, HttpMessageNotReadableException.class})
    public ResponseEntity<ApiError> badRequest(Exception e) {
        String message = e instanceof HttpMessageNotReadableException ? "The request body is not valid JSON" : e.getMessage();
        return error(HttpStatus.BAD_REQUEST, message, null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> invalid(MethodArgumentNotValidException e) {
        Map<String, String> fields = new LinkedHashMap<String, String>();
        for (FieldError error : e.getBindingResult().getFieldErrors()) {
            if (!fields.containsKey(error.getField())) {
                fields.put(error.getField(), error.getDefaultMessage());
            }
        }
        return error(HttpStatus.BAD_REQUEST, "Please fix the highlighted fields", fields);
    }

    private ResponseEntity<ApiError> error(HttpStatus status, String message, Map<String, String> fields) {
        return ResponseEntity.status(status).body(new ApiError(status.value(), message, fields));
    }
}
