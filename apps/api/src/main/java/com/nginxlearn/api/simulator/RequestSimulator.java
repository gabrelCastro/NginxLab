package com.nginxlearn.api.simulator;

import java.nio.charset.StandardCharsets;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.regex.PatternSyntaxException;

import com.nginxlearn.api.simulator.ConfigChecker.Config;
import com.nginxlearn.api.simulator.ConfigChecker.Location;
import com.nginxlearn.api.simulator.ConfigChecker.Modifier;
import com.nginxlearn.api.simulator.ConfigChecker.Server;
import com.nginxlearn.api.simulator.ConfigParser.Directive;

/**
 * Execução determinística de uma requisição, para arquivos estáticos, {@code return} e
 * {@code rewrite}. Espelha {@code src/sim/request.ts}. Sem backends simulados, todo
 * {@code proxy_pass} responde 502, como no navegador quando o cenário não tem backends.
 */
public final class RequestSimulator {

    public record Request(String method, String host, Integer port, String path) {
        public static Request get(String host, String path) {
            return new Request("GET", host, 80, path);
        }
    }

    public record Response(int status, Map<String, String> headers, String body, String serverId, String location, String filePath) {
    }

    private static final int MAX_INTERNAL_REDIRECTS = 10;
    private static final Map<Integer, String> STATUS_TEXT = Map.ofEntries(
            Map.entry(200, "OK"), Map.entry(201, "Created"), Map.entry(204, "No Content"), Map.entry(301, "Moved Permanently"),
            Map.entry(302, "Moved Temporarily"), Map.entry(304, "Not Modified"), Map.entry(400, "Bad Request"), Map.entry(403, "Forbidden"),
            Map.entry(404, "Not Found"), Map.entry(429, "Too Many Requests"), Map.entry(500, "Internal Server Error"),
            Map.entry(502, "Bad Gateway"), Map.entry(503, "Service Temporarily Unavailable"), Map.entry(504, "Gateway Timeout"));

    private RequestSimulator() {
    }

    public static Response simulate(Config config, Request input, VirtualFileSystem fs) {
        String host = (input.host() == null ? "localhost" : input.host()).split(":", -1)[0].toLowerCase(java.util.Locale.ROOT);
        int port = input.port() == null ? 80 : input.port();
        String requestPath = normalizeUri(input.path());
        Server server = selectServer(config, host, port);
        if (server == null) {
            return response(400, "No server on this port", Map.of(), null, null, null);
        }

        String uri = requestPath;
        Location location = selectLocation(server.locations(), uri);
        Directive rewrite = directive(location == null ? server.directives() : location.directives(), "rewrite");
        if (rewrite != null && rewrite.args().size() >= 2) {
            try {
                Matcher matcher = Pattern.compile(rewrite.args().get(0)).matcher(new BoundedText(uri));
                if (matcher.find()) {
                    String target = matcher.replaceFirst(rewrite.args().get(1));
                    String flag = rewrite.args().size() > 2 ? rewrite.args().get(2) : null;
                    if ("redirect".equals(flag) || "permanent".equals(flag)) {
                        return response("permanent".equals(flag) ? 301 : 302, "", Map.of("Location", target), server, location, null);
                    }
                    uri = target;
                    if ("last".equals(flag)) {
                        location = selectLocation(server.locations(), uri);
                    }
                }
            } catch (IllegalArgumentException | IndexOutOfBoundsException | BoundedText.Exhausted ignored) {
                // Como no simulador do navegador, uma regex inválida não altera a URI.
            }
        }

        List<Directive> effective = location == null ? server.directives() : location.directives();
        Directive returnDirective = Optional.ofNullable(directive(effective, "return")).orElse(directive(server.directives(), "return"));
        if (returnDirective != null) {
            int status = returnDirective.args().isEmpty() ? 200 : parseStatus(returnDirective.args().getFirst());
            String bodyOrLocation = expand(String.join(" ", returnDirective.args().subList(Math.min(1, returnDirective.args().size()), returnDirective.args().size())), input, uri);
            boolean redirect = status >= 300 && status < 400;
            Map<String, String> headers = collectHeaders(effective, input, uri);
            if (redirect) {
                headers.put("Location", bodyOrLocation);
            }
            return response(status, redirect ? "" : bodyOrLocation, headers, server, location, null);
        }
        if (directive(effective, "proxy_pass") != null) {
            return response(502, errorPage(502), Map.of("Content-Type", "text/html"), server, location, null);
        }
        return staticRequest(input, uri, server, location, effective, fs, 0);
    }

    private static int parseStatus(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException e) {
            return 500;
        }
    }

    private static Server selectServer(Config config, String host, int port) {
        List<Server> candidates = config.servers().stream().filter(server -> server.port() == port).toList();
        if (candidates.isEmpty()) {
            return null;
        }
        return candidates.stream().filter(server -> server.names().stream().anyMatch(name -> matchesServerName(name, host))).findFirst()
                .or(() -> candidates.stream().filter(Server::defaultServer).findFirst())
                .orElse(candidates.getFirst());
    }

    private static Location selectLocation(List<Location> locations, String uri) {
        for (Location location : locations) {
            if (location.modifier() == Modifier.EXACT && location.pattern().equals(uri)) {
                return location;
            }
        }
        Location longest = locations.stream()
                .filter(location -> (location.modifier() == Modifier.PREFIX || location.modifier() == Modifier.PREFIX_STOP) && uri.startsWith(location.pattern()))
                .max(Comparator.comparingInt(location -> location.pattern().length()))
                .orElse(null);
        // O sort do JavaScript é estável: em empate de tamanho vence o primeiro declarado.
        if (longest != null) {
            int size = longest.pattern().length();
            longest = locations.stream().filter(location -> (location.modifier() == Modifier.PREFIX || location.modifier() == Modifier.PREFIX_STOP)
                    && uri.startsWith(location.pattern()) && location.pattern().length() == size).findFirst().orElse(longest);
        }
        if (longest != null && longest.modifier() == Modifier.PREFIX_STOP) {
            return longest;
        }
        for (Location location : locations) {
            if (location.modifier() != Modifier.REGEX && location.modifier() != Modifier.REGEX_INSENSITIVE) {
                continue;
            }
            try {
                int flags = location.modifier() == Modifier.REGEX_INSENSITIVE ? Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE : 0;
                if (Pattern.compile(location.pattern(), flags).matcher(new BoundedText(uri)).find()) {
                    return location;
                }
            } catch (PatternSyntaxException | BoundedText.Exhausted ignored) {
                // Regex inválida ou cara demais não corresponde.
            }
        }
        return longest;
    }

    private static Response staticRequest(Request input, String uri, Server server, Location location, List<Directive> effective,
                                          VirtualFileSystem fs, int redirects) {
        Directive root = Optional.ofNullable(directive(effective, "root")).orElse(directive(server.directives(), "root"));
        Directive alias = directive(effective, "alias");
        String base = firstArgument(alias);
        if (base == null) {
            base = firstArgument(root);
        }
        if (base == null) {
            base = "/usr/share/nginx/html";
        }
        String suffix = alias != null && location != null ? uri.substring(Math.min(location.pattern().length(), uri.length())) : uri;
        String filePath = VirtualFileSystem.normalizePath(base + "/" + suffix);
        Directive tryFiles = directive(effective, "try_files");
        if (tryFiles != null) {
            List<String> candidates = tryFiles.args();
            boolean found = false;
            for (int index = 0; index < candidates.size(); index++) {
                String candidate = candidates.get(index);
                boolean last = index == candidates.size() - 1;
                if (last && candidate.startsWith("=")) {
                    int code = parseStatus(candidate.substring(1));
                    return response(code, errorPage(code), Map.of("Content-Type", "text/html"), server, location, filePath);
                }
                if (last && candidate.startsWith("/")) {
                    if (redirects >= MAX_INTERNAL_REDIRECTS) {
                        return response(500, errorPage(500), Map.of("Content-Type", "text/html"), server, location, null);
                    }
                    Location redirected = selectLocation(server.locations(), candidate);
                    return staticRequest(input, candidate, server, redirected, redirected == null ? server.directives() : redirected.directives(), fs, redirects + 1);
                }
                String candidatePath = VirtualFileSystem.normalizePath(base + "/" + candidate.replace("$uri", uri));
                boolean exists = candidate.endsWith("/") ? fs.isDirectory(candidatePath) : fs.exists(candidatePath);
                if (exists) {
                    filePath = candidatePath;
                    found = true;
                    break;
                }
            }
            if (!found) {
                return notFound(filePath, server, location);
            }
        }
        if (fs.isDirectory(filePath)) {
            Directive index = Optional.ofNullable(directive(effective, "index")).orElse(directive(server.directives(), "index"));
            List<String> indexes = index == null ? List.of("index.html") : index.args();
            String directory = filePath;
            Optional<String> match = indexes.stream().map(name -> VirtualFileSystem.normalizePath(directory + "/" + name)).filter(fs::exists).findFirst();
            if (match.isEmpty()) {
                return response(403, errorPage(403), Map.of("Content-Type", "text/html"), server, location, filePath);
            }
            filePath = match.get();
        }
        VirtualFileSystem.VirtualFile file = fs.read(filePath);
        if (file == null) {
            return notFound(filePath, server, location);
        }
        Map<String, String> headers = collectHeaders(effective, input, uri);
        headers.put("Content-Type", file.contentType() != null ? file.contentType() : contentType(filePath));
        return response(200, "HEAD".equals(input.method()) ? "" : file.content(), headers, server, location, filePath);
    }

    private static Response notFound(String path, Server server, Location location) {
        return response(404, errorPage(404), Map.of("Content-Type", "text/html"), server, location, path);
    }

    private static Response response(int status, String body, Map<String, String> headers, Server server, Location location, String filePath) {
        Map<String, String> all = new LinkedHashMap<>();
        all.put("Server", "nginx/1.27.5");
        all.putAll(headers);
        all.putIfAbsent("Content-Type", "text/plain");
        all.put("Content-Length", String.valueOf(body.getBytes(StandardCharsets.UTF_8).length));
        return new Response(status, all, body, server == null ? null : server.id(), location == null ? null : location.display(), filePath);
    }

    private static boolean matchesServerName(String pattern, String host) {
        String normalized = pattern.toLowerCase(java.util.Locale.ROOT);
        if (normalized.equals(host)) {
            return true;
        }
        if (normalized.startsWith("*.")) {
            return host.endsWith(normalized.substring(1));
        }
        if (normalized.endsWith(".*")) {
            return host.startsWith(normalized.substring(0, normalized.length() - 1));
        }
        return false;
    }

    private static Directive directive(List<Directive> nodes, String name) {
        return nodes.stream().filter(node -> node.name().equals(name)).findFirst().orElse(null);
    }

    private static String firstArgument(Directive directive) {
        return directive == null || directive.args().isEmpty() ? null : directive.args().getFirst();
    }

    static String normalizeUri(String path) {
        String pathname = path.split("\\?", -1)[0];
        if (pathname.isEmpty()) {
            pathname = "/";
        }
        return VirtualFileSystem.normalizePath(pathname) + (pathname.endsWith("/") && !pathname.equals("/") ? "/" : "");
    }

    private static String expand(String value, Request request, String uri) {
        String remote = "127.0.0.1";
        return value
                .replace("$uri", uri)
                .replace("$host", request.host() == null ? "localhost" : request.host())
                .replace("$scheme", "http")
                .replace("$request_uri", request.path())
                .replace("$remote_addr", remote)
                .replace("$proxy_add_x_forwarded_for", remote);
    }

    private static Map<String, String> collectHeaders(List<Directive> nodes, Request request, String uri) {
        Map<String, String> headers = new LinkedHashMap<>();
        for (Directive node : nodes) {
            if (node.name().equals("add_header") && !node.args().isEmpty()) {
                headers.put(node.args().getFirst(), expand(String.join(" ", node.args().subList(1, node.args().size())), request, uri));
            }
        }
        return headers;
    }

    private static String contentType(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "text/plain";
    }

    /**
     * As regex vêm da configuração do aluno e rodam no servidor. Limitar as leituras do texto
     * interrompe backtracking catastrófico (ReDoS) sem depender de threads ou timeouts.
     */
    static final class BoundedText implements CharSequence {
        static final class Exhausted extends RuntimeException {
            Exhausted() {
                super("regex excedeu o limite de passos", null, false, false);
            }
        }

        private final String text;
        private final int[] budget;

        BoundedText(String text) {
            this(text, new int[] {200_000});
        }

        private BoundedText(String text, int[] budget) {
            this.text = text;
            this.budget = budget;
        }

        @Override
        public char charAt(int index) {
            if (--budget[0] < 0) {
                throw new Exhausted();
            }
            return text.charAt(index);
        }

        @Override
        public int length() {
            return text.length();
        }

        @Override
        public CharSequence subSequence(int start, int end) {
            return new BoundedText(text.substring(start, end), budget);
        }

        @Override
        public String toString() {
            return text;
        }
    }

    static String errorPage(int status) {
        String text = STATUS_TEXT.getOrDefault(status, "Error");
        return "<html>\r\n<head><title>" + status + " " + text + "</title></head>\r\n<body>\r\n<center><h1>" + status + " " + text
                + "</h1></center>\r\n<hr><center>nginx/1.27.5</center>\r\n</body>\r\n</html>\r\n";
    }
}
