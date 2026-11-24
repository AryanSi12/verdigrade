package com.acme.library.service;

import java.util.Optional;
import com.acme.library.dto.BookRequest;
import com.acme.library.dto.BookResponse;
import com.acme.library.entity.Author;
import com.acme.library.entity.Book;
import com.acme.library.entity.Genre;
import com.acme.library.exception.BusinessRuleException;
import com.acme.library.exception.DuplicateResourceException;
import com.acme.library.exception.ResourceNotFoundException;
import com.acme.library.repository.BookRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.AdditionalAnswers;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class BookServiceTest {

  @Mock
  private BookRepository books;
  @Mock
  private AuthorService authorService;
  @InjectMocks
  private BookService service;

  private Author author() {
    Author author = new Author();
    author.setName("Joshua Bloch");
    return author;
  }

  private BookRequest request() {
    BookRequest request = new BookRequest();
    request.setTitle("Effective Java");
    request.setIsbn("978-0-13-468599-1");
    request.setPublishedYear(2018);
    request.setGenre("technology");
    request.setCopies(2);
    request.setAuthorId(7L);
    return request;
  }

  @Test
  void createNormalizesTheIsbnAndSetsAvailableCopies() {
    when(books.existsByIsbn("9780134685991")).thenReturn(false);
    when(authorService.find(7L)).thenReturn(author());
    when(books.save(any(Book.class))).then(AdditionalAnswers.returnsFirstArg());
    BookResponse created = service.create(request());
    assertEquals("9780134685991", created.getIsbn());
    assertEquals(2, created.getCopiesAvailable());
    assertEquals("TECHNOLOGY", created.getGenre());
    assertEquals(12, created.getFingerprint().length());
  }

  @Test
  void createRejectsDuplicateIsbn() {
    when(books.existsByIsbn("9780134685991")).thenReturn(true);
    assertThrows(DuplicateResourceException.class, () -> service.create(request()));
    verify(books, never()).save(any(Book.class));
  }

  @Test
  void createRejectsUnknownGenre() {
    BookRequest request = request();
    request.setGenre("cooking");
    when(authorService.find(7L)).thenReturn(author());
    assertThrows(BusinessRuleException.class, () -> service.create(request));
  }

  @Test
  void getMissingBookThrowsNotFound() {
    when(books.findById(99L)).thenReturn(Optional.empty());
    assertThrows(ResourceNotFoundException.class, () -> service.get(99L));
  }

  @Test
  void deleteRefusesBooksThatAreOnLoan() {
    Book book = new Book();
    book.setCopiesTotal(2);
    book.setCopiesAvailable(1);
    when(books.findById(1L)).thenReturn(Optional.of(book));
    assertThrows(BusinessRuleException.class, () -> service.delete(1L));
    verify(books, never()).delete(any(Book.class));
  }
}
