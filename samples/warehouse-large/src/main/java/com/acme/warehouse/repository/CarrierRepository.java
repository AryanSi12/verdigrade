package com.acme.warehouse.repository;

import com.acme.warehouse.entity.Carrier;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CarrierRepository extends JpaRepository<Carrier, Long> {

  boolean existsByNameIgnoreCase(String name);
}
