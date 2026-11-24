package com.acme.library.scheduler;

import java.time.LocalDate;
import com.acme.library.service.LoanService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class OverdueLoanJob {

  private static final Logger LOG = LoggerFactory.getLogger(OverdueLoanJob.class);

  private final LoanService loanService;

  public OverdueLoanJob(LoanService loanService) {
    this.loanService = loanService;
  }

  @Scheduled(cron = "${library.overdue-cron:0 0 2 * * *}")
  public void run() {
    int count = loanService.markOverdue(LocalDate.now());
    LOG.info("Marked {} loan(s) as overdue", count);
  }
}
