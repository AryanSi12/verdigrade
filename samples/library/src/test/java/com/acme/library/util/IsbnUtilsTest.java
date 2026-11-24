package com.acme.library.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class IsbnUtilsTest {

  @Test
  void acceptsValidIsbn13WithDashes() {
    assertTrue(IsbnUtils.isValid("978-0-13-468599-1"));
  }

  @Test
  void acceptsValidIsbn10() {
    assertTrue(IsbnUtils.isValid("0-306-40615-2"));
    assertTrue(IsbnUtils.isValid("080442957X"));
  }

  @Test
  void rejectsBadChecksumAndShapes() {
    assertFalse(IsbnUtils.isValid("9780134685992"));
    assertFalse(IsbnUtils.isValid("12345"));
    assertFalse(IsbnUtils.isValid(null));
    assertFalse(IsbnUtils.isValid("97801346859AB"));
  }

  @Test
  void normalizeStripsSeparators() {
    assertEquals("080442957X", IsbnUtils.normalize("0-8044-2957-x"));
  }
}
