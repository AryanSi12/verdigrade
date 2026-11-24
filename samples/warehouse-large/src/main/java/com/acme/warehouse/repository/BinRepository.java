package com.acme.warehouse.repository;

import com.acme.warehouse.entity.Bin;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BinRepository extends JpaRepository<Bin, Long> {

  boolean existsByLabelIgnoreCase(String label);
}
