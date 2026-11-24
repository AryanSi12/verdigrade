package com.acme.payments.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.payments.common.Money;
import com.acme.payments.entity.Payment;
import com.acme.payments.exception.BusinessRuleException;
import com.acme.payments.exception.DuplicateResourceException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(PaymentProcessor.class)
class PaymentProcessorTest {

  @Autowired
  private PaymentProcessor processor;

  private Payment captured(String reference, String amount) {
    Payment payment = processor.authorize(reference, 1L, Money.of(amount, "INR"));
    return processor.capture(payment.getId());
  }

  @Test
  void authorizeThenCapture() {
    Payment payment = captured("P-1", "500.00");
    assertThat(payment.getStatus()).isEqualTo("CAPTURED");
  }

  @Test
  void capturingTwiceIsRefused() {
    Payment payment = captured("P-2", "500.00");
    assertThrows(BusinessRuleException.class, () -> processor.capture(payment.getId()));
  }

  @Test
  void duplicateReferenceIsRefused() {
    processor.authorize("P-3", 1L, Money.of("1.00", "INR"));
    assertThrows(DuplicateResourceException.class, () -> processor.authorize("P-3", 1L, Money.of("1.00", "INR")));
  }

  @Test
  void partialRefundsAddUpAndTheLastOneMarksTheRefundedStatus() {
    Payment payment = captured("P-4", "500.00");
    processor.refund(payment.getId(), "R-1", Money.of("200.00", "INR"), "damaged");
    assertThat(processor.refundedSoFar(payment.getId())).isEqualByComparingTo("200.00");
    processor.refund(payment.getId(), "R-2", Money.of("300.00", "INR"), "returned");
    assertThat(processor.refundedSoFar(payment.getId())).isEqualByComparingTo("500.00");
  }

  @Test
  void refundCannotExceedTheCapturedAmount() {
    Payment payment = captured("P-5", "100.00");
    assertThrows(BusinessRuleException.class, () -> processor.refund(payment.getId(), "R-9", Money.of("100.01", "INR"), "x"));
  }

  @Test
  void anAuthorizedPaymentCannotBeRefunded() {
    Payment payment = processor.authorize("P-6", 1L, Money.of("10.00", "INR"));
    assertThrows(BusinessRuleException.class, () -> processor.refund(payment.getId(), "R-8", Money.of("1.00", "INR"), "x"));
  }
}
