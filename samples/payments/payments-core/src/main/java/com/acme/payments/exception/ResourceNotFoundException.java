package com.acme.payments.exception;



public class ResourceNotFoundException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public ResourceNotFoundException(String what, Object id) {
    super(what + " " + id + " was not found");
  }
}
