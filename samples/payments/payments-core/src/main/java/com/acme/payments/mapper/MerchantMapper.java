package com.acme.payments.mapper;

import com.acme.payments.dto.MerchantResponse;
import com.acme.payments.entity.Merchant;

public final class MerchantMapper {

  private MerchantMapper() {
  }

  public static MerchantResponse toResponse(Merchant entity) {
    MerchantResponse response = new MerchantResponse();
    response.setId(entity.getId());
    response.setName(entity.getName());
    response.setEmail(entity.getEmail());
    response.setCountryCode(entity.getCountryCode());
    return response;
  }
}
