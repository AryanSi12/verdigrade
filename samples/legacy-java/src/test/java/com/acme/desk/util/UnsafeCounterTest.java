package com.acme.desk.util;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class UnsafeCounterTest {

  @Test
  void countsFromOne() {
    UnsafeCounter counter = new UnsafeCounter();
    assertEquals(1, counter.next());
    assertEquals(2, counter.next());
    assertEquals(2, counter.current());
  }

  @Test
  void isExactUnderContention() throws InterruptedException {
    final UnsafeCounter counter = new UnsafeCounter();
    Thread[] threads = new Thread[4];
    for (int i = 0; i < threads.length; i++) {
      threads[i] = new Thread(new Runnable() {
        @Override
        public void run() {
          for (int n = 0; n < 1000; n++) {
            counter.next();
          }
        }
      });
      threads[i].start();
    }
    for (Thread thread : threads) {
      thread.join();
    }
    assertEquals(4000, counter.current());
  }

  @Test
  void referencesArePaddedAndIncrease() {
    ReferenceGenerator generator = new ReferenceGenerator();
    assertEquals("TCK-000001", generator.nextTicketReference());
    assertEquals("TCK-000002", generator.nextTicketReference());
  }
}
