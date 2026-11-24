package com.acme.payments.mapper;

import com.acme.payments.dto.PaymentMethodResponse;
import com.acme.payments.entity.PaymentMethod;

public final class PaymentMethodMapper {

  private PaymentMethodMapper() {
  }

  public static PaymentMethodResponse toResponse(PaymentMethod entity) {
    PaymentMethodResponse response = new PaymentMethodResponse();
    response.setId(entity.getId());
    response.setToken(entity.getToken());
    response.setBrand(entity.getBrand());
    response.setLast4(entity.getLast4());
    response.setExpiryYear(entity.getExpiryYear());
    return response;
  }
}
