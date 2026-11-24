package com.acme.library.util;

import java.time.LocalDate;
import java.util.Date;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;

class LegacyDatesTest {

  @Test
  void roundTripKeepsTheDay() {
    LocalDate day = LocalDate.of(2024, 2, 29);
    assertEquals(day, LegacyDates.toLocalDate(LegacyDates.toDate(day)));
  }

  @Test
  void plusDaysMovesForward() {
    Date start = LegacyDates.toDate(LocalDate.of(2024, 1, 30));
    assertEquals(LocalDate.of(2024, 2, 2), LegacyDates.toLocalDate(LegacyDates.plusDays(start, 3)));
  }
}
