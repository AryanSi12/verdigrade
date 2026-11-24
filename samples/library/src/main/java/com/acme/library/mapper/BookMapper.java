package com.acme.library.mapper;

import com.acme.library.dto.BookResponse;
import com.acme.library.entity.Book;
import com.acme.library.util.ChecksumUtils;

public final class BookMapper {

  private BookMapper() {
  }

  public static BookResponse toResponse(Book book) {
    BookResponse response = new BookResponse();
    response.setId(book.getId());
    response.setTitle(book.getTitle());
    response.setIsbn(book.getIsbn());
    response.setPublishedYear(book.getPublishedYear());
    response.setGenre(book.getGenre().name());
    response.setCopiesTotal(book.getCopiesTotal());
    response.setCopiesAvailable(book.getCopiesAvailable());
    response.setAuthorId(book.getAuthor().getId());
    response.setAuthorName(book.getAuthor().getName());
    response.setFingerprint(ChecksumUtils.shortFingerprint(book.getIsbn() + "|" + book.getTitle()));
    return response;
  }
}
