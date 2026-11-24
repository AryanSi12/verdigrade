package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.StockMovementResponse;
import com.acme.warehouse.entity.StockMovement;

public final class StockMovementMapper {

  private StockMovementMapper() {
  }

  public static StockMovementResponse toResponse(StockMovement entity) {
    StockMovementResponse response = new StockMovementResponse();
    response.setId(entity.getId());
    response.setReference(entity.getReference());
    response.setProductId(entity.getProductId());
    response.setQuantity(entity.getQuantity());
    response.setKind(entity.getKind());
    return response;
  }
}
