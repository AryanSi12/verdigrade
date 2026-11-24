package com.acme.warehouse.repository;

import com.acme.warehouse.entity.Shipment;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ShipmentRepository extends JpaRepository<Shipment, Long> {

  boolean existsByTrackingCodeIgnoreCase(String trackingCode);
}
