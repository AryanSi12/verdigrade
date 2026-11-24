package com.acme.library.controller;

import java.util.List;
import com.acme.library.dto.BookRequest;
import com.acme.library.dto.BookResponse;
import com.acme.library.dto.IsbnInfo;
import com.acme.library.service.BookService;
import com.acme.library.service.IsbnLookupService;
import javax.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/books")
public class BookController {

  private final BookService bookService;
  private final IsbnLookupService isbnLookupService;

  public BookController(BookService bookService, IsbnLookupService isbnLookupService) {
    this.bookService = bookService;
    this.isbnLookupService = isbnLookupService;
  }

  @GetMapping
  public List<BookResponse> list(@RequestParam(required = false) String title,
                                 @RequestParam(defaultValue = "false") boolean available) {
    return bookService.list(title, available);
  }

  @GetMapping("/{id}")
  public BookResponse get(@PathVariable Long id) {
    return bookService.get(id);
  }

  @GetMapping("/lookup/{isbn}")
  public ResponseEntity<IsbnInfo> lookup(@PathVariable String isbn) {
    return isbnLookupService.lookup(isbn).map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.notFound().build());
  }

  @PostMapping
  @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
  public ResponseEntity<BookResponse> create(@Valid @RequestBody BookRequest request) {
    return ResponseEntity.status(HttpStatus.CREATED).body(bookService.create(request));
  }

  @PutMapping("/{id}")
  @PreAuthorize("hasAnyRole('LIBRARIAN','ADMIN')")
  public BookResponse update(@PathVariable Long id, @Valid @RequestBody BookRequest request) {
    return bookService.update(id, request);
  }

  @DeleteMapping("/{id}")
  @PreAuthorize("hasRole('ADMIN')")
  public ResponseEntity<Void> delete(@PathVariable Long id) {
    bookService.delete(id);
    return ResponseEntity.noContent().build();
  }
}
