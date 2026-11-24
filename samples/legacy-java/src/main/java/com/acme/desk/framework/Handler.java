package com.acme.desk.framework;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/** In-house command marker: the bean is found by reflection and called as {@code handle(Map)}. */
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.TYPE)
public @interface Handler {

  /** The command name clients send. */
  String value();
}
