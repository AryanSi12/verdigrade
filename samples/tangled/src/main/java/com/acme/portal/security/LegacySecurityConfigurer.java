package com.acme.portal.security;

import javax.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.builders.AuthenticationManagerBuilder;
import org.springframework.security.config.annotation.method.configuration.EnableGlobalMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configuration.WebSecurityConfigurerAdapter;
import org.springframework.security.config.http.SessionCreationPolicy;

/**
 * Security setup of the portal: our provider, JSON 401/403, session login, URL rules and method security.
 * The AuthenticationManager bean below is what AbstractSecuredController signs users in with.
 */
@Configuration
@EnableWebSecurity
@EnableGlobalMethodSecurity(prePostEnabled = true, securedEnabled = true)
public class LegacySecurityConfigurer extends WebSecurityConfigurerAdapter {

    private final PortalAuthenticationProvider provider;
    private final RestAuthenticationEntryPoint entryPoint;
    private final RestAccessDeniedHandler deniedHandler;
    private final SecurityContextBridge bridge;

    public LegacySecurityConfigurer(PortalAuthenticationProvider provider, RestAuthenticationEntryPoint entryPoint, RestAccessDeniedHandler deniedHandler, SecurityContextBridge bridge) {
        this.provider = provider;
        this.entryPoint = entryPoint;
        this.deniedHandler = deniedHandler;
        this.bridge = bridge;
    }

    @Override
    protected void configure(AuthenticationManagerBuilder auth) {
        auth.authenticationProvider(provider);
    }

    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.csrf().disable()
            .sessionManagement().sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED)
            .and()
            .exceptionHandling().authenticationEntryPoint(entryPoint).accessDeniedHandler(deniedHandler)
            .and()
            .logout().logoutUrl("/api/logout")
            .addLogoutHandler((request, response, authentication) -> bridge.clear(request))
            .logoutSuccessHandler((request, response, authentication) -> response.setStatus(HttpServletResponse.SC_NO_CONTENT))
            .and()
            .authorizeRequests()
            .antMatchers("/api/health", "/api/logout").permitAll()
            .antMatchers(HttpMethod.POST, "/api/session").permitAll()
            .antMatchers("/api/admin/**").hasRole(Roles.ADMIN)
            .antMatchers("/api/**").authenticated()
            .anyRequest().permitAll();
    }

    @Bean
    @Override
    public AuthenticationManager authenticationManagerBean() throws Exception {
        return super.authenticationManagerBean();
    }
}
