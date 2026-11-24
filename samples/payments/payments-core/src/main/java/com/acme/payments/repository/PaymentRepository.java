package com.acme.payments.repository;

import com.acme.payments.entity.Payment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRepository extends JpaRepository<Payment, Long> {

  boolean existsByReferenceIgnoreCase(String reference);
}
