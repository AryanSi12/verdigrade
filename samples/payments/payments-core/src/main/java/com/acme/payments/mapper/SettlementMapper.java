package com.acme.payments.mapper;

import com.acme.payments.dto.SettlementResponse;
import com.acme.payments.entity.Settlement;

public final class SettlementMapper {

  private SettlementMapper() {
  }

  public static SettlementResponse toResponse(Settlement entity) {
    SettlementResponse response = new SettlementResponse();
    response.setId(entity.getId());
    response.setBatchId(entity.getBatchId());
    response.setSettledOn(entity.getSettledOn());
    response.setTotalAmount(entity.getTotalAmount());
    return response;
  }
}
