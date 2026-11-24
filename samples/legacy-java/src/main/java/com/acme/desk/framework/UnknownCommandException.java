package com.acme.desk.framework;

public class UnknownCommandException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  public UnknownCommandException(String command) {
    super("Unknown command: " + command);
  }
}
