package com.acme.payments.mapper;

import com.acme.payments.dto.DisputeResponse;
import com.acme.payments.entity.Dispute;

public final class DisputeMapper {

  private DisputeMapper() {
  }

  public static DisputeResponse toResponse(Dispute entity) {
    DisputeResponse response = new DisputeResponse();
    response.setId(entity.getId());
    response.setCaseNumber(entity.getCaseNumber());
    response.setPaymentId(entity.getPaymentId());
    response.setReason(entity.getReason());
    response.setOpenedOn(entity.getOpenedOn());
    return response;
  }
}
