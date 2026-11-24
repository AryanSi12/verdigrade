package com.acme.library.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.library.dto.AuthorRequest;
import com.acme.library.dto.AuthorResponse;
import com.acme.library.entity.Author;
import com.acme.library.exception.DuplicateResourceException;
import com.acme.library.exception.ResourceNotFoundException;
import com.acme.library.mapper.AuthorMapper;
import com.acme.library.repository.AuthorRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class AuthorService {

  private final AuthorRepository authors;

  public AuthorService(AuthorRepository authors) {
    this.authors = authors;
  }

  @Transactional(readOnly = true)
  public List<AuthorResponse> list() {
    return authors.findAll().stream().map(AuthorMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public AuthorResponse get(Long id) {
    return AuthorMapper.toResponse(find(id));
  }

  public AuthorResponse create(AuthorRequest request) {
    if (authors.existsByNameIgnoreCase(request.getName())) {
      throw new DuplicateResourceException("Author " + request.getName() + " already exists");
    }
    Author author = new Author();
    apply(author, request);
    return AuthorMapper.toResponse(authors.save(author));
  }

  public AuthorResponse update(Long id, AuthorRequest request) {
    Author author = find(id);
    apply(author, request);
    return AuthorMapper.toResponse(authors.save(author));
  }

  public void delete(Long id) {
    authors.delete(find(id));
  }

  public Author find(Long id) {
    return authors.findById(id).orElseThrow(() -> new ResourceNotFoundException("Author", id));
  }

  private void apply(Author author, AuthorRequest request) {
    author.setName(request.getName());
    author.setBiography(request.getBiography());
    author.setBirthYear(request.getBirthYear());
  }
}
