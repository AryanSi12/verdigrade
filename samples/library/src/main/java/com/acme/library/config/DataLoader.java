package com.acme.library.config;

import java.time.LocalDate;
import com.acme.library.config.LibraryProperties;
import com.acme.library.entity.Author;
import com.acme.library.entity.Book;
import com.acme.library.entity.Genre;
import com.acme.library.entity.Member;
import com.acme.library.entity.MembershipType;
import com.acme.library.entity.Role;
import com.acme.library.repository.AuthorRepository;
import com.acme.library.repository.BookRepository;
import com.acme.library.repository.MemberRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/** Seeds an admin, a librarian and a few books so the API has something to show. */
@Component
public class DataLoader implements CommandLineRunner {

  private final MemberRepository members;
  private final AuthorRepository authors;
  private final BookRepository books;
  private final PasswordEncoder passwordEncoder;
  private final LibraryProperties properties;

  public DataLoader(MemberRepository members, AuthorRepository authors, BookRepository books,
                    PasswordEncoder passwordEncoder, LibraryProperties properties) {
    this.members = members;
    this.authors = authors;
    this.books = books;
    this.passwordEncoder = passwordEncoder;
    this.properties = properties;
  }

  @Override
  @Transactional
  public void run(String... args) {
    if (members.existsByUsername("admin")) {
      return;
    }
    createMember("admin", "Ada Admin", "admin@library.example", Role.ADMIN);
    createMember("librarian", "Leo Librarian", "librarian@library.example", Role.LIBRARIAN);

    Author tolkien = author("J. R. R. Tolkien", 1892);
    Author bloch = author("Joshua Bloch", 1961);
    Author sagan = author("Carl Sagan", 1934);
    book("The Hobbit", "9780547928227", 1937, Genre.FICTION, 3, tolkien);
    book("Effective Java", "9780134685991", 2018, Genre.TECHNOLOGY, 2, bloch);
    book("Cosmos", "9780345539434", 1980, Genre.SCIENCE, 1, sagan);
  }

  private void createMember(String username, String fullName, String email, Role role) {
    Member member = new Member();
    member.setUsername(username);
    member.setFullName(fullName);
    member.setEmail(email);
    member.setPasswordHash(passwordEncoder.encode(properties.getAdminPassword()));
    member.setRole(role);
    member.setMembershipType(MembershipType.PREMIUM);
    member.setActive(true);
    member.setJoinedOn(LocalDate.now());
    members.save(member);
  }

  private Author author(String name, int birthYear) {
    Author author = new Author();
    author.setName(name);
    author.setBirthYear(birthYear);
    return authors.save(author);
  }

  private void book(String title, String isbn, int year, Genre genre, int copies, Author author) {
    Book book = new Book();
    book.setTitle(title);
    book.setIsbn(isbn);
    book.setPublishedYear(year);
    book.setGenre(genre);
    book.setCopiesTotal(copies);
    book.setCopiesAvailable(copies);
    book.setAuthor(author);
    books.save(book);
  }
}
