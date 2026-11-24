package com.acme.warehouse.repository;

import com.acme.warehouse.entity.PurchaseOrder;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, Long> {

  boolean existsByOrderNumberIgnoreCase(String orderNumber);
}
