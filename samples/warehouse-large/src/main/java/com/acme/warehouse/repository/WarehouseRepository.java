package com.acme.warehouse.repository;

import com.acme.warehouse.entity.Warehouse;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WarehouseRepository extends JpaRepository<Warehouse, Long> {

  boolean existsByCodeIgnoreCase(String code);
}
