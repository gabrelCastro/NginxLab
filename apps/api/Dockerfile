FROM eclipse-temurin:21-jdk-alpine AS build
WORKDIR /build
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q -B dependency:go-offline
COPY src src
RUN ./mvnw -q -B -DskipTests package && cp target/nginxlearn-api-*.jar app.jar

FROM eclipse-temurin:21-jre-alpine
RUN addgroup -S nginxlearn && adduser -S -G nginxlearn nginxlearn
WORKDIR /app
COPY --from=build /build/app.jar app.jar
USER nginxlearn
ENV SPRING_PROFILES_ACTIVE=prod \
    JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080 8081
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s CMD wget -qO- http://127.0.0.1:8081/actuator/health/readiness >/dev/null || exit 1
ENTRYPOINT ["java", "-jar", "/app/app.jar"]
