package com.acme.payments.repository;

import com.acme.payments.entity.Dispute;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DisputeRepository extends JpaRepository<Dispute, Long> {

  boolean existsByCaseNumberIgnoreCase(String caseNumber);
}
