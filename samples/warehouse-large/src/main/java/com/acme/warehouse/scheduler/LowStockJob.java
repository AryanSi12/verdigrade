package com.acme.warehouse.scheduler;

import com.acme.warehouse.config.WarehouseProperties;
import com.acme.warehouse.entity.Product;
import com.acme.warehouse.repository.ProductRepository;
import com.acme.warehouse.service.StockService;
import com.acme.warehouse.util.ReorderCalculator;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class LowStockJob {

  private static final Logger LOG = LoggerFactory.getLogger(LowStockJob.class);

  private final ProductRepository products;
  private final StockService stock;
  private final WarehouseProperties properties;

  public LowStockJob(ProductRepository products, StockService stock, WarehouseProperties properties) {
    this.products = products;
    this.stock = stock;
    this.properties = properties;
  }

  @Scheduled(fixedDelayString = "${warehouse.low-stock-delay-ms:3600000}")
  public List<String> run() {
    List<String> low = new ArrayList<String>();
    for (Product product : products.findAll()) {
      if (ReorderCalculator.isLow(stock.onHand(product.getId()), properties.getLowStockThreshold())) {
        low.add(product.getSku());
      }
    }
    if (!low.isEmpty()) {
      LOG.info("{} product(s) at or below the low-stock threshold", low.size());
    }
    return low;
  }
}
