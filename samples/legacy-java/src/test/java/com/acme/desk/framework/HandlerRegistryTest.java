package com.acme.desk.framework;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Collections;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

class HandlerRegistryTest {

  @Handler("echo")
  public static class Echo {
    public Object handle(Map<String, Object> args) {
      return args.get("say");
    }
  }

  @Handler("boom")
  public static class Boom {
    public Object handle(Map<String, Object> args) {
      throw new IllegalArgumentException("bad input");
    }
  }

  @Configuration
  static class Beans {
    @Bean
    Echo echo() {
      return new Echo();
    }

    @Bean
    Boom boom() {
      return new Boom();
    }
  }

  private HandlerRegistry registry(AnnotationConfigApplicationContext context) {
    return new HandlerRegistry(context);
  }

  @Test
  void dispatchesByCommandName() {
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(Beans.class)) {
      HandlerRegistry registry = registry(context);
      assertEquals(2, registry.size());
      assertTrue(registry.knows("echo"));
      assertEquals("hi", registry.dispatch("echo", Collections.<String, Object>singletonMap("say", "hi")));
    }
  }

  @Test
  void handlerExceptionsComeThroughUnwrapped() {
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(Beans.class)) {
      assertThrows(IllegalArgumentException.class, () -> registry(context).dispatch("boom", Collections.<String, Object>emptyMap()));
    }
  }

  @Test
  void unknownCommandsAreRejected() {
    try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext(Beans.class)) {
      assertThrows(UnknownCommandException.class, () -> registry(context).dispatch("nope", Collections.<String, Object>emptyMap()));
    }
  }
}
