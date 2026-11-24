package com.acme.desk.ticket;

import com.acme.desk.framework.Handler;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
@Handler("escalate")
public class EscalateTicketHandler {

  private final TicketService service;

  public EscalateTicketHandler(TicketService service) {
    this.service = service;
  }

  public Ticket handle(Map<String, Object> args) {
    return service.escalate(((Number) args.get("id")).longValue());
  }
}
