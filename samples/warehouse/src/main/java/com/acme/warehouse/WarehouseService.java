package com.acme.warehouse;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.springframework.stereotype.Service;

@Service
public class WarehouseService {

  private final List<String> items = new ArrayList<String>();

  public List<String> list() {
    return Collections.unmodifiableList(items);
  }

  public void add(String value) {
    items.add(value);
  }
}
