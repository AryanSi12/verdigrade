package com.acme.payments.repository;

import com.acme.payments.entity.Refund;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RefundRepository extends JpaRepository<Refund, Long> {

  java.util.List<com.acme.payments.entity.Refund> findByPaymentId(Long paymentId);

  boolean existsByReferenceIgnoreCase(String reference);
}
