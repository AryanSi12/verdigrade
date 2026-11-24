package com.acme.library.util;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Date;

public final class LegacyDates {

  private LegacyDates() {
  }

  public static Date toDate(LocalDate date) {
    return Date.from(date.atStartOfDay(ZoneId.systemDefault()).toInstant());
  }

  public static LocalDate toLocalDate(Date date) {
    return date.toInstant().atZone(ZoneId.systemDefault()).toLocalDate();
  }

  public static Date plusDays(Date date, int days) {
    return new Date(date.getTime() + days * 24L * 60L * 60L * 1000L);
  }
}
