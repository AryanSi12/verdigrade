package com.acme.desk.ticket;

import com.acme.desk.framework.HandlerRegistry;
import com.acme.desk.framework.UnknownCommandException;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/commands")
public class CommandController {

  private final HandlerRegistry registry;

  public CommandController(HandlerRegistry registry) {
    this.registry = registry;
  }

  @PostMapping("/{name}")
  public Object run(@PathVariable("name") String name, @RequestBody Map<String, Object> args) {
    return registry.dispatch(name, args);
  }

  @ExceptionHandler(UnknownCommandException.class)
  @ResponseStatus(HttpStatus.NOT_FOUND)
  public Map<String, String> unknown(UnknownCommandException e) {
    return java.util.Collections.singletonMap("error", e.getMessage());
  }
}
