package com.nginxlearn.api.simulator;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Predicate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import com.nginxlearn.api.simulator.ConfigParser.Directive;

/** Equivalente a {@code src/sim/check.ts} e {@code src/sim/model.ts}. */
public final class ConfigChecker {

    private static final String PATH = "/etc/nginx/nginx.conf";

    private static final Map<String, Set<String>> CONTEXTS = Map.of(
            "main", Set.of("events", "http", "error_log", "worker_processes"),
            "events", Set.of("worker_connections"),
            "http", Set.of("server", "upstream", "include", "default_type", "access_log", "error_log", "sendfile", "proxy_cache_path", "limit_req_zone"),
            "server", Set.of("listen", "server_name", "root", "index", "location", "return", "rewrite", "access_log", "error_log"),
            "location", Set.of("root", "alias", "index", "try_files", "return", "rewrite", "proxy_pass", "proxy_set_header", "add_header", "proxy_cache", "proxy_cache_valid", "limit_req", "limit_req_status"),
            "upstream", Set.of("server", "keepalive"));
    private static final Set<String> BLOCKS = Set.of("events", "http", "server", "location", "upstream");
    private static final Set<String> UNSUPPORTED = Set.of("include", "sendfile", "keepalive");
    private static final Set<String> KNOWN = CONTEXTS.values().stream().flatMap(Set::stream).collect(Collectors.toUnmodifiableSet());
    private static final Pattern PORT = Pattern.compile("(?::|^)(\\d+)$");

    public enum Modifier { EXACT, PREFIX, PREFIX_STOP, REGEX, REGEX_INSENSITIVE }

    public record Location(Modifier modifier, String pattern, int line, List<Directive> directives) {
        public String display() {
            String symbol = switch (modifier) {
                case EXACT -> "= ";
                case PREFIX_STOP -> "^~ ";
                case REGEX -> "~ ";
                case REGEX_INSENSITIVE -> "~* ";
                case PREFIX -> "";
            };
            return symbol + pattern;
        }
    }

    public record Server(String id, int line, int port, boolean defaultServer, List<String> names,
                         List<Directive> directives, List<Location> locations) {
    }

    public record Config(List<Server> servers) {
    }

    public record CheckResult(boolean ok, List<String> output, Integer errorLine, Config config) {
    }

    private record Problem(String message, int line) {
    }

    private ConfigChecker() {
    }

    public static CheckResult check(String source) {
        ConfigParser.ParseResult parsed = ConfigParser.parse(source);
        if (parsed instanceof ConfigParser.ParseFailure failure) {
            return failure(failure.message(), failure.line());
        }
        List<Directive> directives = ((ConfigParser.Parsed) parsed).directives();
        Problem problem = validate(directives, "main");
        if (problem != null) {
            return failure(problem.message(), problem.line());
        }
        String syntaxOk = "nginx: the configuration file " + PATH + " syntax is ok";
        if (directives.stream().noneMatch(directive -> directive.name().equals("events"))) {
            return new CheckResult(false, List.of(syntaxOk, "nginx: [emerg] no \"events\" section in configuration",
                    "nginx: configuration file " + PATH + " test failed"), null, null);
        }
        Optional<Directive> unsupported = find(directives, node -> UNSUPPORTED.contains(node.name()));
        if (unsupported.isPresent()) {
            Directive node = unsupported.get();
            return new CheckResult(false, List.of("NginxLearn: a diretiva \"" + node.name()
                    + "\" é válida no nginx, mas ainda não é simulada (linha " + node.line() + ")."), node.line(), null);
        }
        return new CheckResult(true, List.of(syntaxOk, "nginx: configuration file " + PATH + " test is successful"), null, compile(directives));
    }

    private static Problem validate(List<Directive> nodes, String context) {
        Set<String> allowed = CONTEXTS.getOrDefault(context, Set.of());
        Map<String, Integer> seenLocations = new HashMap<>();
        for (Directive node : nodes) {
            if (!allowed.contains(node.name())) {
                return new Problem(KNOWN.contains(node.name())
                        ? "\"" + node.name() + "\" directive is not allowed here"
                        : "unknown directive \"" + node.name() + "\"", node.line());
            }
            boolean expectsBlock = BLOCKS.contains(node.name()) && !(context.equals("upstream") && node.name().equals("server"));
            if (expectsBlock != node.isBlock()) {
                return new Problem(node.isBlock() ? "unexpected \"{\"" : "directive \"" + node.name() + "\" has no opening \"{\"", node.line());
            }
            if (node.name().equals("listen")) {
                if (node.args().isEmpty()) {
                    return new Problem("invalid number of arguments in \"listen\" directive", node.line());
                }
                for (int index = 1; index < node.args().size(); index++) {
                    String argument = node.args().get(index);
                    if (!argument.equals("default_server") && !argument.startsWith("ssl")) {
                        return new Problem("invalid parameter \"" + argument + "\"", node.argLines().get(index));
                    }
                }
            }
            if (node.name().equals("location")) {
                String key = String.join(" ", node.args());
                if (seenLocations.containsKey(key)) {
                    return new Problem("duplicate location \"" + (node.args().isEmpty() ? "" : node.args().getLast()) + "\"", node.line());
                }
                seenLocations.put(key, node.line());
            }
            if (node.isBlock()) {
                Problem nested = validate(node.children(), node.name());
                if (nested != null) {
                    return nested;
                }
            }
        }
        return null;
    }

    private static Optional<Directive> find(List<Directive> nodes, Predicate<Directive> predicate) {
        for (Directive node : nodes) {
            if (predicate.test(node)) {
                return Optional.of(node);
            }
            if (node.isBlock()) {
                Optional<Directive> nested = find(node.children(), predicate);
                if (nested.isPresent()) {
                    return nested;
                }
            }
        }
        return Optional.empty();
    }

    private static CheckResult failure(String message, int line) {
        return new CheckResult(false, List.of("nginx: [emerg] " + message + " in " + PATH + ":" + line,
                "nginx: configuration file " + PATH + " test failed"), line, null);
    }

    private static Config compile(List<Directive> ast) {
        List<Directive> nodes = ast.stream().filter(node -> node.name().equals("http")).findFirst()
                .map(Directive::children).orElse(List.of());
        List<Directive> servers = nodes.stream().filter(node -> node.name().equals("server")).toList();
        return new Config(java.util.stream.IntStream.range(0, servers.size()).mapToObj(index -> compileServer(servers.get(index), index)).toList());
    }

    private static Server compileServer(Directive node, int index) {
        List<Directive> directives = node.children() == null ? List.of() : node.children();
        Optional<Directive> listen = directives.stream().filter(directive -> directive.name().equals("listen")).findFirst();
        String address = listen.flatMap(directive -> directive.args().stream().filter(argument -> !argument.contains("=")).findFirst()).orElse("80");
        Matcher matcher = PORT.matcher(address);
        int port = matcher.find() ? Integer.parseInt(matcher.group(1)) : 80;
        List<String> names = directives.stream().filter(directive -> directive.name().equals("server_name"))
                .flatMap(directive -> directive.args().stream()).toList();
        List<Location> locations = directives.stream().filter(directive -> directive.name().equals("location"))
                .map(ConfigChecker::compileLocation).toList();
        return new Server(names.isEmpty() ? "server-" + (index + 1) : names.getFirst(), node.line(), port,
                listen.map(directive -> directive.args().contains("default_server")).orElse(false), names, directives, locations);
    }

    private static Location compileLocation(Directive node) {
        String token = node.args().isEmpty() ? null : node.args().getFirst();
        Modifier modifier = "=".equals(token) ? Modifier.EXACT
                : "^~".equals(token) ? Modifier.PREFIX_STOP
                : "~".equals(token) ? Modifier.REGEX
                : "~*".equals(token) ? Modifier.REGEX_INSENSITIVE
                : Modifier.PREFIX;
        String pattern = modifier == Modifier.PREFIX
                ? (token == null ? "/" : token)
                : (node.args().size() > 1 ? node.args().get(1) : "/");
        return new Location(modifier, pattern, node.line(), node.children() == null ? List.of() : node.children());
    }
}
