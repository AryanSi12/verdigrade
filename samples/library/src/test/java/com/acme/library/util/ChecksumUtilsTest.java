package com.acme.library.util;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class ChecksumUtilsTest {

  @Test
  void sha256OfAbcMatchesKnownDigest() {
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", ChecksumUtils.sha256Hex("abc"));
  }

  @Test
  void fingerprintIsTwelveCharacters() {
    assertEquals(12, ChecksumUtils.shortFingerprint("anything").length());
  }
}
