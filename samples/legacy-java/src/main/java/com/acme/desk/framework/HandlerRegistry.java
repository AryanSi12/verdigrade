package com.acme.desk.framework;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;
import org.springframework.aop.support.AopUtils;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;
import org.springframework.util.ReflectionUtils;

/** Wires {@link Handler} beans to command names with plain reflection (no interface to implement). */
@Component
public class HandlerRegistry {

  private final Map<String, Object> beans = new HashMap<String, Object>();
  private final Map<String, Method> methods = new HashMap<String, Method>();

  public HandlerRegistry(ApplicationContext context) {
    for (Object bean : context.getBeansWithAnnotation(Handler.class).values()) {
      Class<?> target = AopUtils.getTargetClass(bean);
      String name = target.getAnnotation(Handler.class).value();
      Method method = ReflectionUtils.findMethod(target, "handle", Map.class);
      if (method == null) {
        throw new IllegalStateException(target.getName() + " needs a handle(Map) method");
      }
      beans.put(name, bean);
      methods.put(name, method);
    }
  }

  public boolean knows(String command) {
    return methods.containsKey(command);
  }

  public Object dispatch(String command, Map<String, Object> args) {
    Method method = methods.get(command);
    if (method == null) {
      throw new UnknownCommandException(command);
    }
    try {
      return method.invoke(beans.get(command), args);
    } catch (InvocationTargetException e) {
      Throwable cause = e.getCause();
      if (cause instanceof RuntimeException) {
        throw (RuntimeException) cause;
      }
      throw new IllegalStateException(cause);
    } catch (IllegalAccessException e) {
      throw new IllegalStateException(e);
    }
  }

  public int size() {
    return methods.size();
  }
}
