package com.acme.warehouse.repository;

import com.acme.warehouse.entity.Supplier;
import org.springframework.data.jpa.repository.JpaRepository;

public interface SupplierRepository extends JpaRepository<Supplier, Long> {

  boolean existsByNameIgnoreCase(String name);
}
