package com.acme.warehouse.scheduler;

import static org.assertj.core.api.Assertions.assertThat;

import com.acme.warehouse.config.WarehouseProperties;
import com.acme.warehouse.entity.Product;
import com.acme.warehouse.repository.ProductRepository;
import com.acme.warehouse.service.StockService;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(StockService.class)
class LowStockJobTest {

  @Autowired
  private ProductRepository products;

  @Autowired
  private StockService stock;

  private final WarehouseProperties properties = new WarehouseProperties();

  @Test
  void productsWithNoStockAreLow() {
    Product product = new Product();
    product.setSku("LOW-1");
    product.setName("Empty shelf item");
    product.setCategoryId(1L);
    product.setUnitPrice(new BigDecimal("1.00"));
    product.setReorderLevel(3);
    products.save(product);
    assertThat(new LowStockJob(products, stock, properties).run()).contains("LOW-1");
  }
}
