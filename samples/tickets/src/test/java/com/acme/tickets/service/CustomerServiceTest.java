package com.acme.tickets.service;

import java.util.Optional;
import com.acme.tickets.dto.CustomerRequest;
import com.acme.tickets.entity.Customer;
import com.acme.tickets.exception.DuplicateResourceException;
import com.acme.tickets.exception.ResourceNotFoundException;
import com.acme.tickets.repository.CustomerRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.AdditionalAnswers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class CustomerServiceTest {

  @Mock private CustomerRepository customers;
  @InjectMocks private CustomerService service;

  private CustomerRequest request() {
    CustomerRequest request = new CustomerRequest();
    request.setName("Asha Rao");
    request.setEmail("Asha@Example.org");
    return request;
  }

  @Test
  void createLowerCasesTheEmail() {
    when(customers.save(any(Customer.class))).then(AdditionalAnswers.returnsFirstArg());
    assertEquals("asha@example.org", service.create(request()).getEmail());
  }

  @Test
  void createRejectsADuplicateEmail() {
    when(customers.existsByEmailIgnoreCase("Asha@Example.org")).thenReturn(true);
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
  }

  @Test
  void missingCustomerIsNotFound() {
    when(customers.findById(5L)).thenReturn(Optional.empty());
    assertThrows(ResourceNotFoundException.class, () -> service.get(5L));
  }
}
