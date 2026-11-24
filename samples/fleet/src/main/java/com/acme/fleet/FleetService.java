package com.acme.fleet;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import org.springframework.stereotype.Service;

@Service
public class FleetService {

  private final List<String> items = new ArrayList<String>();

  public List<String> list() {
    return Collections.unmodifiableList(items);
  }

  public void add(String value) {
    items.add(value);
  }
}
