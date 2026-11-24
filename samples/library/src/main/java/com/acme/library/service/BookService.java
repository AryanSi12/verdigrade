package com.acme.library.service;

import java.util.List;
import java.util.stream.Collectors;
import com.acme.library.dto.BookRequest;
import com.acme.library.dto.BookResponse;
import com.acme.library.entity.Author;
import com.acme.library.entity.Book;
import com.acme.library.entity.Genre;
import com.acme.library.exception.BusinessRuleException;
import com.acme.library.exception.DuplicateResourceException;
import com.acme.library.exception.ResourceNotFoundException;
import com.acme.library.mapper.BookMapper;
import com.acme.library.repository.BookRepository;
import com.acme.library.util.IsbnUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class BookService {

  private final BookRepository books;
  private final AuthorService authorService;

  public BookService(BookRepository books, AuthorService authorService) {
    this.books = books;
    this.authorService = authorService;
  }

  @Transactional(readOnly = true)
  public List<BookResponse> list(String title, boolean onlyAvailable) {
    List<Book> found;
    if (title != null && !title.trim().isEmpty()) {
      found = books.findByTitleContainingIgnoreCase(title.trim());
    } else if (onlyAvailable) {
      found = books.findAvailable();
    } else {
      found = books.findAll();
    }
    return found.stream().map(BookMapper::toResponse).collect(Collectors.toList());
  }

  @Transactional(readOnly = true)
  public BookResponse get(Long id) {
    return BookMapper.toResponse(find(id));
  }

  public BookResponse create(BookRequest request) {
    String isbn = IsbnUtils.normalize(request.getIsbn());
    if (books.existsByIsbn(isbn)) {
      throw new DuplicateResourceException("A book with ISBN " + isbn + " already exists");
    }
    Book book = new Book();
    book.setIsbn(isbn);
    book.setCopiesTotal(request.getCopies());
    book.setCopiesAvailable(request.getCopies());
    applyCommon(book, request);
    return BookMapper.toResponse(books.save(book));
  }

  public BookResponse update(Long id, BookRequest request) {
    Book book = find(id);
    int borrowed = book.getCopiesTotal() - book.getCopiesAvailable();
    if (request.getCopies() < borrowed) {
      throw new BusinessRuleException("Cannot reduce copies below the " + borrowed + " currently on loan");
    }
    book.setCopiesTotal(request.getCopies());
    book.setCopiesAvailable(request.getCopies() - borrowed);
    applyCommon(book, request);
    return BookMapper.toResponse(books.save(book));
  }

  public void delete(Long id) {
    Book book = find(id);
    if (book.getCopiesAvailable() != book.getCopiesTotal()) {
      throw new BusinessRuleException("Book is still on loan");
    }
    books.delete(book);
  }

  public Book find(Long id) {
    return books.findById(id).orElseThrow(() -> new ResourceNotFoundException("Book", id));
  }

  private void applyCommon(Book book, BookRequest request) {
    Author author = authorService.find(request.getAuthorId());
    book.setTitle(request.getTitle());
    book.setPublishedYear(request.getPublishedYear());
    book.setGenre(parseGenre(request.getGenre()));
    book.setAuthor(author);
  }

  private Genre parseGenre(String value) {
    try {
      return Genre.valueOf(value.trim().toUpperCase());
    } catch (IllegalArgumentException e) {
      throw new BusinessRuleException("Unknown genre " + value);
    }
  }
}
