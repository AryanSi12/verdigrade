package com.acme.library.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.acme.library.dto.AuthorRequest;
import com.acme.library.dto.AuthorResponse;
import com.acme.library.entity.Author;
import com.acme.library.exception.DuplicateResourceException;
import com.acme.library.exception.ResourceNotFoundException;
import com.acme.library.repository.AuthorRepository;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.AdditionalAnswers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class AuthorServiceTest {

  @Mock
  private AuthorRepository authors;
  @InjectMocks
  private AuthorService service;

  private AuthorRequest request(String name) {
    AuthorRequest request = new AuthorRequest();
    request.setName(name);
    request.setBirthYear(1950);
    return request;
  }

  @Test
  void createSavesANewAuthor() {
    when(authors.save(any(Author.class))).then(AdditionalAnswers.returnsFirstArg());
    AuthorResponse response = service.create(request("Octavia Butler"));
    assertEquals("Octavia Butler", response.getName());
    assertEquals(Integer.valueOf(1950), response.getBirthYear());
  }

  @Test
  void createRejectsADuplicateName() {
    when(authors.existsByNameIgnoreCase("Octavia Butler")).thenReturn(true);
    assertThrows(DuplicateResourceException.class, () -> service.create(request("Octavia Butler")));
    verify(authors, never()).save(any(Author.class));
  }

  @Test
  void updateChangesTheFields() {
    Author existing = new Author();
    existing.setName("Old Name");
    when(authors.findById(2L)).thenReturn(Optional.of(existing));
    when(authors.save(any(Author.class))).then(AdditionalAnswers.returnsFirstArg());
    assertEquals("New Name", service.update(2L, request("New Name")).getName());
  }

  @Test
  void getMissingAuthorThrowsNotFound() {
    when(authors.findById(9L)).thenReturn(Optional.empty());
    assertThrows(ResourceNotFoundException.class, () -> service.get(9L));
  }
}
