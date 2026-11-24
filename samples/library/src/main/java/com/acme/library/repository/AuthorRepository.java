package com.acme.library.repository;

import com.acme.library.entity.Author;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AuthorRepository extends JpaRepository<Author, Long> {

  Optional<Author> findByNameIgnoreCase(String name);

  boolean existsByNameIgnoreCase(String name);
}
