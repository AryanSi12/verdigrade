package com.acme.payments.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.payments.dto.AccountRequest;
import com.acme.payments.dto.AccountResponse;
import com.acme.payments.entity.Account;
import com.acme.payments.exception.DuplicateResourceException;
import com.acme.payments.exception.ResourceNotFoundException;
import com.acme.payments.mapper.AccountMapper;
import com.acme.payments.repository.AccountRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class AccountService {

  private final AccountRepository repository;

  public AccountService(AccountRepository repository) {
    this.repository = repository;
  }

  @Transactional(readOnly = true)
  public List<AccountResponse> list() {
    return repository.findAll().stream().map(AccountMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public AccountResponse get(Long id) {
    return AccountMapper.toResponse(find(id));
  }

  public AccountResponse create(AccountRequest request) {
    if (repository.existsByAccountNumberIgnoreCase(request.getAccountNumber())) {
      throw new DuplicateResourceException("Account " + request.getAccountNumber() + " already exists");
    }
    Account entity = new Account();
    entity.setAccountNumber(request.getAccountNumber());
    entity.setHolderName(request.getHolderName());
    entity.setCurrency(request.getCurrency());
    return AccountMapper.toResponse(repository.save(entity));
  }

  public AccountResponse update(Long id, AccountRequest request) {
    Account entity = find(id);
    entity.setAccountNumber(request.getAccountNumber());
    entity.setHolderName(request.getHolderName());
    entity.setCurrency(request.getCurrency());
    return AccountMapper.toResponse(repository.save(entity));
  }

  public void delete(Long id) {
    repository.delete(find(id));
  }

  public Account find(Long id) {
    return repository.findById(id).orElseThrow(() -> new ResourceNotFoundException("Account", id));
  }
}
