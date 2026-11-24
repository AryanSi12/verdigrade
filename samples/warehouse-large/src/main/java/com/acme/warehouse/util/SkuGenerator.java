package com.acme.warehouse.util;

import java.util.Locale;

public final class SkuGenerator {

  private SkuGenerator() {
  }

  /** "Pallet Jack 2T" and 7 become "PALLET-JACK-2T-0007". */
  public static String forName(String name, int serial) {
    String slug = name.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]+", "-").replaceAll("^-|-$", "");
    return String.format("%s-%04d", slug, serial);
  }
}
