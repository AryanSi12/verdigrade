package com.acme.library.util;

import com.google.common.base.Strings;

public final class IsbnUtils {

  private IsbnUtils() {
  }

  public static String normalize(String raw) {
    return Strings.nullToEmpty(raw).replace("-", "").replace(" ", "").toUpperCase();
  }

  public static boolean isValid(String raw) {
    String isbn = normalize(raw);
    if (isbn.length() == 10) {
      return isValidIsbn10(isbn);
    }
    if (isbn.length() == 13) {
      return isValidIsbn13(isbn);
    }
    return false;
  }

  static boolean isValidIsbn10(String isbn) {
    int sum = 0;
    for (int i = 0; i < 10; i++) {
      char c = isbn.charAt(i);
      int digit;
      if (c == 'X' && i == 9) {
        digit = 10;
      } else if (Character.isDigit(c)) {
        digit = c - '0';
      } else {
        return false;
      }
      sum += digit * (10 - i);
    }
    return sum % 11 == 0;
  }

  static boolean isValidIsbn13(String isbn) {
    int sum = 0;
    for (int i = 0; i < 13; i++) {
      char c = isbn.charAt(i);
      if (!Character.isDigit(c)) {
        return false;
      }
      sum += (c - '0') * (i % 2 == 0 ? 1 : 3);
    }
    return sum % 10 == 0;
  }
}
