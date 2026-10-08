package com.nginxlearn.api.identity;

import io.micrometer.core.instrument.MeterRegistry;
import jakarta.servlet.DispatcherType;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.util.matcher.RequestMatcher;

import com.nginxlearn.api.web.RateLimitFilter;
import com.nginxlearn.api.web.RateLimitProperties;

@Configuration
public class SecurityConfiguration {

    @Bean
    RateLimitProperties rateLimitProperties(Environment environment) {
        return Binder.get(environment).bindOrCreate("nginxlearn.rate-limit", RateLimitProperties.class);
    }

    @Bean
    SecurityFilterChain securityFilterChain(HttpSecurity http, GuestIdentityService identityService, RateLimitProperties limits,
                                            MeterRegistry meters, Environment environment) throws Exception {
        GuestAuthenticationFilter authentication = new GuestAuthenticationFilter(identityService);
        return http
                .csrf(csrf -> csrf.disable())
                .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
                .httpBasic(basic -> basic.disable())
                .formLogin(form -> form.disable())
                .authorizeHttpRequests(auth -> auth
                        .dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
                        .requestMatchers(HttpMethod.POST, "/api/v1/guests", "/api/v1/sessions").permitAll()
                        .requestMatchers(HttpMethod.GET, "/api/v1/openapi.yaml").permitAll()
                        .requestMatchers("/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers(managementPort(environment)).permitAll()
                        .anyRequest().authenticated())
                .exceptionHandling(ex -> ex.authenticationEntryPoint((request, response, exception) ->
                        response.sendError(401)))
                .addFilterBefore(authentication, UsernamePasswordAuthenticationFilter.class)
                .addFilterBefore(new RateLimitFilter(limits, meters, System::currentTimeMillis), GuestAuthenticationFilter.class)
                .build();
    }

    // Métricas só na porta de gestão (management.server.port), que o proxy público não expõe.
    private static RequestMatcher managementPort(Environment environment) {
        return request -> {
            Integer port = environment.getProperty("local.management.port", Integer.class);
            return port != null && port > 0 && request.getLocalPort() == port && request.getRequestURI().startsWith("/actuator/");
        };
    }
}
