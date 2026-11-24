package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.EmployeeRequest;
import com.acme.warehouse.dto.EmployeeResponse;
import com.acme.warehouse.entity.Employee;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.EmployeeMapper;
import com.acme.warehouse.repository.EmployeeRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class EmployeeService {

  private final EmployeeRepository repository;

  public EmployeeService(EmployeeRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<EmployeeResponse> list() {
    return repository.findAll().stream().map(EmployeeMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public EmployeeResponse get(Long id) {
    return EmployeeMapper.toResponse(find(id));
  }

  public EmployeeResponse create(EmployeeRequest request) {
    if (repository.existsByBadgeIgnoreCase(request.getBadge())) {
      throw new DuplicateResourceException("Employee " + request.getBadge() + " already exists");
    }
    Employee entity = new Employee();
    entity.setBadge(request.getBadge());
    entity.setName(request.getName());
    entity.setHiredOn(request.getHiredOn());
    entity.setActive(request.getActive());
    return EmployeeMapper.toResponse(repository.save(entity));
  }

  public EmployeeResponse update(Long id, EmployeeRequest request) {
    Employee entity = find(id);
    entity.setBadge(request.getBadge());
    entity.setName(request.getName());
    entity.setHiredOn(request.getHiredOn());
    entity.setActive(request.getActive());
    return EmployeeMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Employee find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Employee", id));
  }
}
