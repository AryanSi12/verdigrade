package com.acme.tickets.util;

import java.util.UUID;
import org.springframework.stereotype.Component;

@Component
public class TicketCodeGenerator {

  public String generate(Long eventId) {
    String random = UUID.randomUUID().toString().replace("-", "").substring(0, 10).toUpperCase();
    return "TKT-" + eventId + "-" + random;
  }
}
