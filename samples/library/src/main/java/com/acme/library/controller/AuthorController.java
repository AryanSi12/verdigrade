package com.acme.library.controller;

import java.util.List;
import com.acme.library.dto.AuthorRequest;
import com.acme.library.dto.AuthorResponse;
import com.acme.library.service.AuthorService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/authors")
public class AuthorController {

  private final AuthorService authorService;

  public AuthorController(AuthorService authorService) {
    this.authorService = authorService;
  }

  @GetMapping
  public List<AuthorResponse> list() {
    return authorService.list();
  }

  @GetMapping("/{id}")
  public AuthorResponse get(@PathVariable Long id) {
    return authorService.get(id);
  }

  @PostMapping
  @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
  public ResponseEntity<AuthorResponse> create(@Valid @RequestBody AuthorRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(authorService.create(request));
  }

  @PutMapping("/{id}")
  @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
  public AuthorResponse update(@PathVariable Long id, @Valid @RequestBody AuthorRequest request) {
    return authorService.update(id, request);
  }

  @DeleteMapping("/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> delete(@PathVariable Long id) {
    authorService.delete(id);
    return ResponseEntity.noContent().build();
  }
}
