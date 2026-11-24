package com.acme.warehouse.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.warehouse.dto.BinRequest;
import com.acme.warehouse.dto.BinResponse;
import com.acme.warehouse.entity.Bin;
import com.acme.warehouse.exception.DuplicateResourceException;
import com.acme.warehouse.exception.ResourceNotFoundException;
import com.acme.warehouse.mapper.BinMapper;
import com.acme.warehouse.repository.BinRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class BinService {

  private final BinRepository repository;

  public BinService(BinRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<BinResponse> list() {
    return repository.findAll().stream().map(BinMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public BinResponse get(Long id) {
    return BinMapper.toResponse(find(id));
  }

  public BinResponse create(BinRequest request) {
    if (repository.existsByLabelIgnoreCase(request.getLabel())) {
      throw new DuplicateResourceException("Bin " + request.getLabel() + " already exists");
    }
    Bin entity = new Bin();
    entity.setLabel(request.getLabel());
    entity.setZoneId(request.getZoneId());
    entity.setMaxWeightKg(request.getMaxWeightKg());
    return BinMapper.toResponse(repository.save(entity));
  }

  public BinResponse update(Long id, BinRequest request) {
    Bin entity = find(id);
    entity.setLabel(request.getLabel());
    entity.setZoneId(request.getZoneId());
    entity.setMaxWeightKg(request.getMaxWeightKg());
    return BinMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Bin find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Bin", id));
  }
}
