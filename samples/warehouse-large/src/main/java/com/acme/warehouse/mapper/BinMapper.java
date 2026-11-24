package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.BinResponse;
import com.acme.warehouse.entity.Bin;

public final class BinMapper {

  private BinMapper() {
  }

  public static BinResponse toResponse(Bin entity) {
    BinResponse response = new BinResponse();
    response.setId(entity.getId());
    response.setLabel(entity.getLabel());
    response.setZoneId(entity.getZoneId());
    response.setMaxWeightKg(entity.getMaxWeightKg());
    return response;
  }
}
