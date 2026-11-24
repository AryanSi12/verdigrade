package com.acme.library.mapper;

import com.acme.library.dto.AuthorResponse;
import com.acme.library.entity.Author;

public final class AuthorMapper {

  private AuthorMapper() {
  }

  public static AuthorResponse toResponse(Author author) {
    AuthorResponse response = new AuthorResponse();
    response.setId(author.getId());
    response.setName(author.getName());
    response.setBiography(author.getBiography());
    response.setBirthYear(author.getBirthYear());
    return response;
  }
}
