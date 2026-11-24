package com.acme.library.security;

import com.acme.library.entity.Member;
import com.acme.library.repository.MemberRepository;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class LibraryUserDetailsService implements UserDetailsService {

  private final MemberRepository members;

  public LibraryUserDetailsService(MemberRepository members) {
    this.members = members;
  }

  @Override
  @Transactional(readOnly = true)
  public UserDetails loadUserByUsername(String username) {
    Member member = members.findByUsername(username)
        .orElseThrow(() -> new UsernameNotFoundException("No member named " + username));
    return User.withUsername(member.getUsername())
        .password(member.getPasswordHash())
        .roles(member.getRole().name())
        .disabled(!member.isActive())
        .build();
  }
}
