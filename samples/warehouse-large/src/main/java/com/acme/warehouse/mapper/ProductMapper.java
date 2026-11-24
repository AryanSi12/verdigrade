package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.ProductResponse;
import com.acme.warehouse.entity.Product;

public final class ProductMapper {

  private ProductMapper() {
  }

  public static ProductResponse toResponse(Product entity) {
    ProductResponse response = new ProductResponse();
    response.setId(entity.getId());
    response.setSku(entity.getSku());
    response.setName(entity.getName());
    response.setCategoryId(entity.getCategoryId());
    response.setUnitPrice(entity.getUnitPrice());
    response.setReorderLevel(entity.getReorderLevel());
    return response;
  }
}
