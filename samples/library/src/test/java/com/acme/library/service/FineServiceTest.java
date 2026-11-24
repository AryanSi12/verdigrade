package com.acme.library.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.acme.library.config.LibraryProperties;
import com.acme.library.entity.Fine;
import com.acme.library.entity.Loan;
import com.acme.library.repository.FineRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.AdditionalAnswers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class FineServiceTest {

  @Mock
  private FineRepository fines;

  private FineService service() {
    LibraryProperties properties = new LibraryProperties();
    properties.setIsbnLookupUrl("http://x/{isbn}");
    return new FineService(fines, properties);
  }

  @Test
  void noFineWhenReturnedOnTimeOrEarly() {
    LocalDate due = LocalDate.of(2024, 5, 10);
    assertEquals(0, service().calculate(due, due).signum());
    assertEquals(0, service().calculate(due, due.minusDays(2)).signum());
  }

  @Test
  void fineGrowsPerDayLate() {
    LocalDate due = LocalDate.of(2024, 5, 10);
    assertEquals(new BigDecimal("1.00"), service().calculate(due, due.plusDays(4)));
  }

  @Test
  void chargeIfLateSavesAFineWithAReason() {
    Loan loan = new Loan();
    loan.setDueOn(LocalDate.of(2024, 5, 10));
    when(fines.save(any(Fine.class))).then(AdditionalAnswers.returnsFirstArg());
    Fine fine = service().chargeIfLate(loan, LocalDate.of(2024, 5, 12));
    assertEquals(new BigDecimal("0.50"), fine.getAmount());
    assertTrue(fine.getReason().contains("2 day"));
  }

  @Test
  void chargeIfLateDoesNothingWhenOnTime() {
    Loan loan = new Loan();
    loan.setDueOn(LocalDate.of(2024, 5, 10));
    assertNull(service().chargeIfLate(loan, LocalDate.of(2024, 5, 10)));
    verify(fines, never()).save(any(Fine.class));
  }
}
