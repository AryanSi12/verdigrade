package com.acme.tickets.exception;

import java.util.ArrayList;
import java.util.List;
import com.acme.tickets.dto.ErrorResponse;
import javax.servlet.http.HttpServletRequest;
import javax.validation.ConstraintViolation;
import javax.validation.ConstraintViolationException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

  private static final Logger LOG = LoggerFactory.getLogger(GlobalExceptionHandler.class);

  @ExceptionHandler(ResourceNotFoundException.class)
  public ResponseEntity<ErrorResponse> notFound(ResourceNotFoundException ex, HttpServletRequest request) {
    return build(HttpStatus.NOT_FOUND, ex.getMessage(), request, null);
  }

  @ExceptionHandler({DuplicateResourceException.class, BusinessRuleException.class})
  public ResponseEntity<ErrorResponse> conflict(RuntimeException ex, HttpServletRequest request) {
    return build(HttpStatus.CONFLICT, ex.getMessage(), request, null);
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ErrorResponse> invalidBody(MethodArgumentNotValidException ex, HttpServletRequest request) {
    List<String> details = new ArrayList<String>();
    for (FieldError error : ex.getBindingResult().getFieldErrors()) {
      details.add(error.getField() + ": " + error.getDefaultMessage());
    }
    return build(HttpStatus.BAD_REQUEST, "Validation failed", request, details);
  }

  @ExceptionHandler(ConstraintViolationException.class)
  public ResponseEntity<ErrorResponse> invalidParameter(ConstraintViolationException ex, HttpServletRequest request) {
    List<String> details = new ArrayList<String>();
    for (ConstraintViolation<?> violation : ex.getConstraintViolations()) {
      details.add(violation.getPropertyPath() + ": " + violation.getMessage());
    }
    return build(HttpStatus.BAD_REQUEST, "Validation failed", request, details);
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ErrorResponse> unexpected(Exception ex, HttpServletRequest request) {
    LOG.error("Unexpected error on {}", request.getRequestURI(), ex);
    return build(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected error", request, null);
  }

  private ResponseEntity<ErrorResponse> build(HttpStatus status, String message, HttpServletRequest request, List<String> details) {
    ErrorResponse body = new ErrorResponse(status.value(), status.getReasonPhrase(), message, request.getRequestURI());
    if (details != null) {
      body.setDetails(details);
    }
    return ResponseEntity.status(status).body(body);
  }
}
