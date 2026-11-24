package com.acme.library.repository;

import java.util.List;
import com.acme.library.entity.Author;
import com.acme.library.entity.Book;
import com.acme.library.entity.Genre;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import static org.junit.jupiter.api.Assertions.*;

@DataJpaTest
class BookRepositoryTest {

  @Autowired private TestEntityManager em;
  @Autowired private BookRepository books;

  private Book persist(String title, String isbn, int available, Genre genre, Author author) {
    Book book = new Book();
    book.setTitle(title);
    book.setIsbn(isbn);
    book.setPublishedYear(2000);
    book.setGenre(genre);
    book.setCopiesTotal(2);
    book.setCopiesAvailable(available);
    book.setAuthor(author);
    return em.persist(book);
  }

  private Author author(String name) {
    Author author = new Author();
    author.setName(name);
    author.setBiography("A biography that is stored as text.");
    return em.persist(author);
  }

  @Test
  void findsByIsbnAndTitleFragment() {
    Author author = author("Ursula K. Le Guin");
    persist("A Wizard of Earthsea", "9780547773742", 1, Genre.FICTION, author);
    assertTrue(books.findByIsbn("9780547773742").isPresent());
    assertTrue(books.existsByIsbn("9780547773742"));
    assertEquals(1, books.findByTitleContainingIgnoreCase("wizard").size());
    assertTrue(books.findByTitleContainingIgnoreCase("dragon").isEmpty());
  }

  @Test
  void findAvailableSkipsBooksWithNoCopiesAndSortsByTitle() {
    Author author = author("Someone Else");
    persist("Zeta", "1111111111111", 1, Genre.SCIENCE, author);
    persist("Alpha", "2222222222222", 1, Genre.SCIENCE, author);
    persist("Gone", "3333333333333", 0, Genre.SCIENCE, author);
    List<Book> available = books.findAvailable();
    assertEquals(2, available.size());
    assertEquals("Alpha", available.get(0).getTitle());
  }

  @Test
  void findsByAuthorAndGenre() {
    Author first = author("First Author");
    Author second = author("Second Author");
    persist("One", "4444444444444", 1, Genre.HISTORY, first);
    persist("Two", "5555555555555", 1, Genre.CHILDREN, second);
    assertEquals(1, books.findByAuthorId(first.getId()).size());
    assertEquals("Two", books.findByGenre(Genre.CHILDREN).get(0).getTitle());
  }

  @Test
  void auditColumnsAreFilledOnPersist() {
    Book book = persist("Audited", "6666666666666", 1, Genre.FICTION, author("Audit Author"));
    assertNotNull(book.getCreatedAt());
    assertNotNull(book.getUpdatedAt());
    assertNotNull(book.getVersion());
  }
}
