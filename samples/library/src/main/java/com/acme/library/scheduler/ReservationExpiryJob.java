package com.acme.library.scheduler;

import java.util.Date;
import com.acme.library.service.ReservationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ReservationExpiryJob {

  private static final Logger LOG = LoggerFactory.getLogger(ReservationExpiryJob.class);

  private final ReservationService reservationService;

  public ReservationExpiryJob(ReservationService reservationService) {
    this.reservationService = reservationService;
  }

  @Scheduled(fixedDelayString = "${library.expiry-delay-ms:3600000}", initialDelay = 60000)
  public void run() {
    int count = reservationService.expireOld(new Date());
    LOG.info("Expired {} reservation(s)", count);
  }
}
