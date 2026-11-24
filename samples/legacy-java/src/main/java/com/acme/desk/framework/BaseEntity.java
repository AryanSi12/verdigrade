package com.acme.desk.framework;

import java.time.LocalDateTime;
import javax.persistence.*;

/** In-house entity base: id, optimistic lock and an audit timestamp every table in the desk shares. */
@MappedSuperclass
public abstract class BaseEntity {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Version
  private Long version;

  private LocalDateTime createdAt;

  public Long getId() {
    return id;
  }

  public Long getVersion() {
    return version;
  }

  public LocalDateTime getCreatedAt() {
    return createdAt;
  }

  @PrePersist
  protected void stamp() {
    createdAt = LocalDateTime.now();
  }
}
