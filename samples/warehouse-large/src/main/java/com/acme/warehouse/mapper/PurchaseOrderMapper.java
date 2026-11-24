package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.PurchaseOrderResponse;
import com.acme.warehouse.entity.PurchaseOrder;

public final class PurchaseOrderMapper {

  private PurchaseOrderMapper() {
  }

  public static PurchaseOrderResponse toResponse(PurchaseOrder entity) {
    PurchaseOrderResponse response = new PurchaseOrderResponse();
    response.setId(entity.getId());
    response.setOrderNumber(entity.getOrderNumber());
    response.setSupplierId(entity.getSupplierId());
    response.setExpectedOn(entity.getExpectedOn());
    response.setQuantity(entity.getQuantity());
    return response;
  }
}
