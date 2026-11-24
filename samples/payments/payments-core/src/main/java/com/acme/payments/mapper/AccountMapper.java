package com.acme.payments.mapper;

import com.acme.payments.dto.AccountResponse;
import com.acme.payments.entity.Account;

public final class AccountMapper {

  private AccountMapper() {
  }

  public static AccountResponse toResponse(Account entity) {
    AccountResponse response = new AccountResponse();
    response.setId(entity.getId());
    response.setAccountNumber(entity.getAccountNumber());
    response.setHolderName(entity.getHolderName());
    response.setCurrency(entity.getCurrency());
    return response;
  }
}
