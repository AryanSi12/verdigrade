package com.acme.library.repository;

import com.acme.library.entity.Member;
import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface MemberRepository extends JpaRepository<Member, Long> {

  Optional<Member> findByUsername(String username);

  boolean existsByUsername(String username);

  boolean existsByEmail(String email);

  List<Member> findByActiveTrue();
}
