package com.acme.desk.util;

import java.lang.reflect.Field;
import sun.misc.Unsafe;

/** Lock-free counter from the days before AtomicLong was good enough; uses the JDK's private Unsafe. */
public class UnsafeCounter {

  private static final Unsafe UNSAFE;
  private static final long VALUE_OFFSET;

  static {
    try {
      Field field = Unsafe.class.getDeclaredField("theUnsafe");
      field.setAccessible(true);
      UNSAFE = (Unsafe) field.get(null);
      VALUE_OFFSET = UNSAFE.objectFieldOffset(UnsafeCounter.class.getDeclaredField("value"));
    } catch (Exception e) {
      throw new ExceptionInInitializerError(e);
    }
  }

  private volatile long value;

  public long next() {
    return UNSAFE.getAndAddLong(this, VALUE_OFFSET, 1L) + 1;
  }

  public long current() {
    return value;
  }
}
