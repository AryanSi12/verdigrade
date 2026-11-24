package com.acme.board.web;

import com.acme.board.dto.ApiError;
import com.acme.board.task.TaskNotFoundException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiError> invalid(MethodArgumentNotValidException error) {
        ApiError body = new ApiError(400, "Please fix the highlighted fields");
        for (FieldError field : error.getBindingResult().getFieldErrors()) {
            body.add(field.getField(), field.getDefaultMessage());
        }
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiError> unreadable(HttpMessageNotReadableException error) {
        ApiError body = new ApiError(400, "The request body could not be read (check the priority and the date)");
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(body);
    }

    @ExceptionHandler(TaskNotFoundException.class)
    public ResponseEntity<ApiError> missing(TaskNotFoundException error) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError(404, error.getMessage()));
    }
}
