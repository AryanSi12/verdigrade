package com.acme.payments.service;

import com.acme.payments.common.Money;
import com.acme.payments.entity.Payment;
import com.acme.payments.entity.Refund;
import com.acme.payments.exception.BusinessRuleException;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.repository.PaymentRepository;
import com.acme.payments.repository.RefundRepository;
import java.math.BigDecimal;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** AUTHORIZED, then CAPTURED, then (partly or fully) refunded; anything else is a business-rule error. */
@Service
@Transactional
public class PaymentProcessor {

  private final PaymentRepository payments;
  private final RefundRepository refunds;

  public PaymentProcessor(PaymentRepository payments, RefundRepository refunds) {
    this.payments = payments;
    this.refunds = refunds;
  }

  public Payment authorize(String reference, Long merchantId, Money amount) {
    if (payments.existsByReferenceIgnoreCase(reference)) {
      throw new DuplicateResourceException("Payment " + reference + " already exists");
    }
    Payment payment = new Payment();
    payment.setReference(reference);
    payment.setMerchantId(merchantId);
    payment.setAmount(amount.amount());
    payment.setCurrency(amount.currency());
    payment.setStatus("AUTHORIZED");
    return payments.save(payment);
  }

  public Payment capture(Long paymentId) {
    Payment payment = find(paymentId);
    if (!"AUTHORIZED".equals(payment.getStatus())) {
      throw new BusinessRuleException("Only an authorized payment can be captured (now " + payment.getStatus() + ")");
    }
    payment.setStatus("CAPTURED");
    return payments.save(payment);
  }

  public Refund refund(Long paymentId, String reference, Money amount, String reason) {
    Payment payment = find(paymentId);
    if (!"CAPTURED".equals(payment.getStatus())) {
      throw new BusinessRuleException("Only a captured payment can be refunded (now " + payment.getStatus() + ")");
    }
    Money refunded = Money.of(refundedSoFar(paymentId), payment.getCurrency());
    Money total = Money.of(payment.getAmount(), payment.getCurrency());
    if (refunded.plus(amount).compareTo(total) > 0) {
      throw new BusinessRuleException("Refund exceeds the captured amount");
    }
    Refund refund = new Refund();
    refund.setReference(reference);
    refund.setPaymentId(paymentId);
    refund.setAmount(amount.amount());
    refund.setReason(reason);
    refund = refunds.save(refund);
    if (refunded.plus(amount).compareTo(total) == 0) {
      payment.setStatus("REFUNDED");
      payments.save(payment);
    }
    return refund;
  }

  public BigDecimal refundedSoFar(Long paymentId) {
    BigDecimal sum = BigDecimal.ZERO;
    for (Refund refund : refunds.findByPaymentId(paymentId)) {
      sum = sum.add(refund.getAmount());
    }
    return sum;
  }

  private Payment find(Long id) {
    return payments.findById(id).orElseThrow(() -> new ResourceNotFoundException("Payment", id));
  }
}
