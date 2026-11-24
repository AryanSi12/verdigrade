package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.CategoryResponse;
import com.acme.warehouse.entity.Category;

public final class CategoryMapper {

  private CategoryMapper() {
  }

  public static CategoryResponse toResponse(Category entity) {
    CategoryResponse response = new CategoryResponse();
    response.setId(entity.getId());
    response.setName(entity.getName());
    response.setDescription(entity.getDescription());
    return response;
  }
}
