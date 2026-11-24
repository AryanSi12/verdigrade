package com.acme.tickets.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;

class TicketCodeGeneratorTest {

  private final TicketCodeGenerator generator = new TicketCodeGenerator();

  @Test
  void codeStartsWithTheEventId() {
    assertTrue(generator.generate(42L).startsWith("TKT-42-"));
  }

  @Test
  void codesAreUnique() {
    assertNotEquals(generator.generate(1L), generator.generate(1L));
  }

  @Test
  void codeIsUpperCaseAndFixedLength() {
    String code = generator.generate(7L);
    assertEquals(code.toUpperCase(), code);
    assertEquals("TKT-7-".length() + 10, code.length());
  }
}
