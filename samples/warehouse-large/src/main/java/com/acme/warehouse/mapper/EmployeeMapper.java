package com.acme.warehouse.mapper;

import com.acme.warehouse.dto.EmployeeResponse;
import com.acme.warehouse.entity.Employee;

public final class EmployeeMapper {

  private EmployeeMapper() {
  }

  public static EmployeeResponse toResponse(Employee entity) {
    EmployeeResponse response = new EmployeeResponse();
    response.setId(entity.getId());
    response.setBadge(entity.getBadge());
    response.setName(entity.getName());
    response.setHiredOn(entity.getHiredOn());
    response.setActive(entity.getActive());
    return response;
  }
}
