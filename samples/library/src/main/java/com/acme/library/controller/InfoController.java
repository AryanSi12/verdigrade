package com.acme.library.controller;

import java.util.LinkedHashMap;
import java.util.Map;

import javax.servlet.http.HttpServletRequest;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/info")
public class InfoController {

  @GetMapping
  public Map<String, Object> info(HttpServletRequest request) {
    Map<String, Object> info = new LinkedHashMap<String, Object>();
    info.put("service", "library-service");
    info.put("remoteAddress", request.getRemoteAddr());
    info.put("method", request.getMethod());
    return info;
  }
}
