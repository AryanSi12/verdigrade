package com.acme.warehouse.repository;

import com.acme.warehouse.entity.Zone;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ZoneRepository extends JpaRepository<Zone, Long> {

  boolean existsByCodeIgnoreCase(String code);
}
