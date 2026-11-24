package com.acme.library.scheduler;

import java.time.LocalDate;
import com.acme.library.service.LoanService;
import org.junit.jupiter.api.Test;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OverdueLoanJobTest {

  @Test
  void runAsksTheServiceToMarkLoansForToday() {
    LoanService loanService = mock(LoanService.class);
    when(loanService.markOverdue(any(LocalDate.class))).thenReturn(2);
    new OverdueLoanJob(loanService).run();
    verify(loanService).markOverdue(LocalDate.now());
  }
}
