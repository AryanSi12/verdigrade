package com.acme.warehouse.config;

import com.acme.warehouse.entity.Category;
import com.acme.warehouse.entity.Warehouse;
import com.acme.warehouse.repository.CategoryRepository;
import com.acme.warehouse.repository.WarehouseRepository;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** Seeds two rows so a fresh `spring-boot:run` has something to list. Not used by the tests. */
@Component
@Profile("!test")
public class DataLoader implements CommandLineRunner {

  private final WarehouseRepository warehouses;
  private final CategoryRepository categories;

  public DataLoader(WarehouseRepository warehouses, CategoryRepository categories) {
    this.warehouses = warehouses;
    this.categories = categories;
  }

  @Override
  public void run(String... args) {
    if (warehouses.count() == 0) {
      Warehouse main = new Warehouse();
      main.setCode("WH-MAIN");
      main.setName("Main distribution centre");
      main.setCity("Nagpur");
      main.setCapacity(25000);
      warehouses.save(main);
    }
    if (categories.count() == 0) {
      Category tools = new Category();
      tools.setName("Tools");
      tools.setDescription("Hand and power tools");
      categories.save(tools);
    }
  }
}
