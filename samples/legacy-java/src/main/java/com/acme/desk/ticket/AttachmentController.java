package com.acme.desk.ticket;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

/** Accepts an upload and reports what it saw; the desk does not store the bytes in this sample. */
@RestController
@RequestMapping("/api/tickets/{id}/attachments")
public class AttachmentController {

  private final TicketService service;

  public AttachmentController(TicketService service) {
    this.service = service;
  }

  @PostMapping
  public Map<String, Object> upload(@PathVariable("id") Long id, @RequestParam("file") MultipartFile file) throws IOException {
    Ticket ticket = service.require(id);
    Map<String, Object> out = new LinkedHashMap<String, Object>();
    out.put("ticket", ticket.getReference());
    out.put("name", file.getOriginalFilename());
    out.put("bytes", file.getBytes().length);
    return out;
  }
}
