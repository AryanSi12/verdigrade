package com.acme.payments.mapper;

import com.acme.payments.dto.RefundResponse;
import com.acme.payments.entity.Refund;

public final class RefundMapper {

  private RefundMapper() {
  }

  public static RefundResponse toResponse(Refund entity) {
    RefundResponse response = new RefundResponse();
    response.setId(entity.getId());
    response.setReference(entity.getReference());
    response.setPaymentId(entity.getPaymentId());
    response.setAmount(entity.getAmount());
    response.setReason(entity.getReason());
    return response;
  }
}
