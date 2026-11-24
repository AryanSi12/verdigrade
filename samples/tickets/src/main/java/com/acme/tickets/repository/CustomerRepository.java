package com.acme.tickets.repository;

import com.acme.tickets.entity.Customer;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CustomerRepository extends JpaRepository<Customer, Long> {

  boolean existsByEmailIgnoreCase(String email);

  Optional<Customer> findByEmailIgnoreCase(String email);
}
