package com.acme.warehouse.repository;

import com.acme.warehouse.entity.Employee;
import org.springframework.data.jpa.repository.JpaRepository;

public interface EmployeeRepository extends JpaRepository<Employee, Long> {

  boolean existsByBadgeIgnoreCase(String badge);
}
