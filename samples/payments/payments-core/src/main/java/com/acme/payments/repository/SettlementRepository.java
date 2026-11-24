package com.acme.payments.repository;

import com.acme.payments.entity.Settlement;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SettlementRepository extends JpaRepository<Settlement, Long> {

  boolean existsByBatchIdIgnoreCase(String batchId);
}
