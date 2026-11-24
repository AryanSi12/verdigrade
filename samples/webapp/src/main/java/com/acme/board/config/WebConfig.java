package com.acme.board.config;

import com.acme.board.web.RequestStatsInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final RequestStatsInterceptor stats;

    public WebConfig(RequestStatsInterceptor stats) {
        this.stats = stats;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(stats).addPathPatterns("/api/**");
    }
}
