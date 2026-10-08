package com.nginxlearn.api;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.security.autoconfigure.UserDetailsServiceAutoConfiguration;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class NginxLearnApplication {

    public static void main(String[] args) {
        SpringApplication.run(NginxLearnApplication.class, args);
    }
}
