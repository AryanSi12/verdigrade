package com.acme.payments.common;

public final class LuhnChecker {

  private LuhnChecker() {
  }

  public static boolean isValid(String digits) {
    if (digits == null || digits.length() < 12 || !digits.matches("[0-9]+")) {
      return false;
    }
    int sum = 0;
    boolean doubleIt = false;
    for (int i = digits.length() - 1; i >= 0; i--) {
      int d = digits.charAt(i) - '0';
      if (doubleIt) {
        d *= 2;
        if (d > 9) {
          d -= 9;
        }
      }
      sum += d;
      doubleIt = !doubleIt;
    }
    return sum % 10 == 0;
  }

  /** "4242 4242 4242 4242" becomes "************4242". */
  public static String mask(String digits) {
    String clean = digits.replaceAll("[^0-9]", "");
    if (clean.length() <= 4) {
      return clean;
    }
    StringBuilder out = new StringBuilder();
    for (int i = 0; i < clean.length() - 4; i++) {
      out.append('*');
    }
    return out.append(clean.substring(clean.length() - 4)).toString();
  }
}
