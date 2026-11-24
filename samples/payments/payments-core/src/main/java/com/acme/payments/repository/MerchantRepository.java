package com.acme.payments.repository;

import com.acme.payments.entity.Merchant;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MerchantRepository extends JpaRepository<Merchant, Long> {

  boolean existsByNameIgnoreCase(String name);
}
