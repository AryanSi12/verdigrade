package com.acme.library.mapper;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.acme.library.dto.BookResponse;
import com.acme.library.dto.LoanResponse;
import com.acme.library.entity.Author;
import com.acme.library.entity.Book;
import com.acme.library.entity.Genre;
import com.acme.library.entity.Loan;
import com.acme.library.entity.LoanStatus;
import com.acme.library.entity.Member;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

class MappersTest {

  private Book book() {
    Author author = new Author();
    author.setId(1L);
    author.setName("Mapper Author");
    Book book = new Book();
    book.setId(2L);
    book.setTitle("Mapped");
    book.setIsbn("9780134685991");
    book.setGenre(Genre.SCIENCE);
    book.setCopiesTotal(3);
    book.setCopiesAvailable(2);
    book.setAuthor(author);
    return book;
  }

  @Test
  void bookMapperCopiesFieldsAndBuildsAFingerprint() {
    BookResponse response = BookMapper.toResponse(book());
    assertEquals("Mapped", response.getTitle());
    assertEquals("SCIENCE", response.getGenre());
    assertEquals("Mapper Author", response.getAuthorName());
    assertEquals(12, response.getFingerprint().length());
  }

  @Test
  void loanMapperCopiesDatesAndStatus() {
    Member member = new Member();
    member.setId(3L);
    member.setFullName("Mia Mapper");
    Loan loan = new Loan();
    loan.setId(4L);
    loan.setBook(book());
    loan.setMember(member);
    loan.setLoanedOn(LocalDate.of(2024, 1, 1));
    loan.setDueOn(LocalDate.of(2024, 1, 15));
    loan.setStatus(LoanStatus.ACTIVE);
    LoanResponse response = LoanMapper.toResponse(loan);
    assertEquals("Mapped", response.getBookTitle());
    assertEquals("Mia Mapper", response.getMemberName());
    assertEquals(LocalDate.of(2024, 1, 15), response.getDueOn());
    assertEquals("ACTIVE", response.getStatus());
  }
}
