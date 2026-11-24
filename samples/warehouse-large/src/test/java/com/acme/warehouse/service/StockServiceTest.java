package com.acme.warehouse.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.acme.warehouse.dto.StockMovementRequest;
import com.acme.warehouse.exception.BusinessRuleException;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import({StockService.class, StockMovementService.class})
class StockServiceTest {

  @Autowired
  private StockService stock;

  @Autowired
  private StockMovementService movements;

  private void move(String reference, String kind, int quantity) {
    StockMovementRequest request = new StockMovementRequest();
    request.setReference(reference);
    request.setProductId(77L);
    request.setQuantity(quantity);
    request.setKind(kind);
    movements.create(request);
  }

  @Test
  void onHandIsInMinusOut() {
    move("M-1", "IN", 40);
    move("M-2", "OUT", 15);
    assertThat(stock.onHand(77L)).isEqualTo(25);
    assertThat(stock.history(77L)).hasSize(2);
  }

  @Test
  void issuingMoreThanOnHandIsRefused() {
    move("M-3", "IN", 5);
    StockMovementRequest request = new StockMovementRequest();
    request.setProductId(77L);
    request.setQuantity(9);
    request.setKind("OUT");
    assertThrows(BusinessRuleException.class, () -> stock.assertCanIssue(request));
  }
}
