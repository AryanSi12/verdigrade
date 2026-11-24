package com.acme.library.repository;

import com.acme.library.entity.Book;
import com.acme.library.entity.Genre;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface BookRepository extends JpaRepository<Book, Long> {

  Optional<Book> findByIsbn(String isbn);

  boolean existsByIsbn(String isbn);

  List<Book> findByTitleContainingIgnoreCase(String title);

  List<Book> findByAuthorId(Long authorId);

  List<Book> findByGenre(Genre genre);

  @Query("select b from Book b where b.copiesAvailable > 0 order by b.title")
  List<Book> findAvailable();
}
