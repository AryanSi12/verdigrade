package com.acme.desk.util;

import org.springframework.stereotype.Component;

@Component
public class ReferenceGenerator {

  private final UnsafeCounter counter = new UnsafeCounter();

  /** TCK-000001, TCK-000002, ... */
  public String nextTicketReference() {
    return String.format("TCK-%06d", counter.next());
  }
}
