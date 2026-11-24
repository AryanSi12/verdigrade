package com.acme.payments.repository;

import com.acme.payments.entity.Account;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AccountRepository extends JpaRepository<Account, Long> {

  boolean existsByAccountNumberIgnoreCase(String accountNumber);
}
