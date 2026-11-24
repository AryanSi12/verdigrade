package com.acme.warehouse.repository;

import com.acme.warehouse.entity.StockMovement;
import org.springframework.data.jpa.repository.JpaRepository;

public interface StockMovementRepository extends JpaRepository<StockMovement, Long> {

  java.util.List<com.acme.warehouse.entity.StockMovement> findByProductId(Long productId);

  boolean existsByReferenceIgnoreCase(String reference);
}
