package com.nginxlearn.api.web;

import java.time.Duration;

import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * Limites por janela fixa, ligados a {@code nginxlearn.rate-limit.*}. Cada regra pode ser
 * ajustada parcialmente (por exemplo, só {@code guests.requests}); o resto usa o padrão.
 */
public record RateLimitProperties(@DefaultValue("true") boolean enabled, Rule guests, Rule sessions, Rule accounts, Rule attempts, Rule writes) {

    public RateLimitProperties {
        guests = Rule.or(guests, 10, Duration.ofMinutes(10));
        sessions = Rule.or(sessions, 10, Duration.ofMinutes(5));
        accounts = Rule.or(accounts, 5, Duration.ofMinutes(10));
        attempts = Rule.or(attempts, 30, Duration.ofMinutes(1));
        writes = Rule.or(writes, 240, Duration.ofMinutes(1));
    }

    public record Rule(Integer requests, Duration window) {
        static Rule or(Rule rule, int requests, Duration window) {
            return new Rule(rule == null || rule.requests() == null ? requests : rule.requests(),
                    rule == null || rule.window() == null ? window : rule.window());
        }
    }
}
