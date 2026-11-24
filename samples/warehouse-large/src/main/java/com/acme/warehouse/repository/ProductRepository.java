package com.acme.warehouse.repository;

import com.acme.warehouse.entity.Product;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, Long> {

  boolean existsBySkuIgnoreCase(String sku);
}
