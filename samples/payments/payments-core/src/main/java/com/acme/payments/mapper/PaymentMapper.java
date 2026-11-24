package com.acme.payments.mapper;

import com.acme.payments.dto.PaymentResponse;
import com.acme.payments.entity.Payment;

public final class PaymentMapper {

  private PaymentMapper() {
  }

  public static PaymentResponse toResponse(Payment entity) {
    PaymentResponse response = new PaymentResponse();
    response.setId(entity.getId());
    response.setReference(entity.getReference());
    response.setMerchantId(entity.getMerchantId());
    response.setAmount(entity.getAmount());
    response.setCurrency(entity.getCurrency());
    response.setStatus(entity.getStatus());
    return response;
  }
}
