package com.acme.desk.framework;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.transaction.annotation.Transactional;

/**
 * In-house service base class. Subclasses supply the repository and override the hooks; every save in the
 * desk goes through {@link #save(BaseEntity)} so the hooks always run.
 */
@Transactional
public abstract class BaseService<T extends BaseEntity> {

  protected abstract JpaRepository<T, Long> repository();

  protected void beforeSave(T entity) {
  }

  protected void afterSave(T entity) {
  }

  public T save(T entity) {
    beforeSave(entity);
    T saved = repository().save(entity);
    afterSave(saved);
    return saved;
  }

  @Transactional(readOnly = true)
  public List<T> all() {
    return repository().findAll();
  }

  @Transactional(readOnly = true)
  public T require(Long id) {
    return repository().findById(id).orElseThrow(() -> new NotFoundException(id));
  }
}
