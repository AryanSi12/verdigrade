package com.acme.desk.ticket;

import com.acme.desk.framework.Handler;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
@Handler("close")
public class CloseTicketHandler {

  private final TicketService service;

  public CloseTicketHandler(TicketService service) {
    this.service = service;
  }

  public Ticket handle(Map<String, Object> args) {
    return service.close(((Number) args.get("id")).longValue());
  }
}
