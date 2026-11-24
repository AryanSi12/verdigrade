package com.acme.warehouse.service;

import com.acme.warehouse.dto.StockMovementRequest;
import com.acme.warehouse.exception.BusinessRuleException;
import com.acme.warehouse.repository.StockMovementRepository;
import java.util.List;
import com.acme.warehouse.entity.StockMovement;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Stock on hand is the sum of IN movements minus OUT movements for a product. */
@Service
@Transactional(readOnly = true)
public class StockService {

  private final StockMovementRepository movements;

  public StockService(StockMovementRepository movements) {
    this.movements = movements;
  }

  public int onHand(Long productId) {
    int total = 0;
    for (StockMovement movement : movements.findByProductId(productId)) {
      if ("IN".equals(movement.getKind())) {
        total += movement.getQuantity();
      } else if ("OUT".equals(movement.getKind())) {
        total -= movement.getQuantity();
      }
    }
    return total;
  }

  public void assertCanIssue(StockMovementRequest request) {
    if ("OUT".equals(request.getKind()) && onHand(request.getProductId()) < request.getQuantity()) {
      throw new BusinessRuleException("Not enough stock for product " + request.getProductId());
    }
  }

  public List<StockMovement> history(Long productId) {
    return movements.findByProductId(productId);
  }
}
