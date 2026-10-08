package com.nginxlearn.api.simulator;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Disco somente leitura do cenário. Equivalente a {@code src/sim/fs.ts}. */
public final class VirtualFileSystem {

    public record VirtualFile(String content, String contentType) {
    }

    private final Map<String, VirtualFile> files = new LinkedHashMap<>();

    public VirtualFileSystem(Map<String, VirtualFile> seed) {
        seed.forEach((path, file) -> files.put(normalizePath(path), file));
    }

    public VirtualFile read(String path) {
        return files.get(normalizePath(path));
    }

    public boolean exists(String path) {
        return files.containsKey(normalizePath(path));
    }

    public boolean isDirectory(String path) {
        String normalized = normalizePath(path);
        String prefix = (normalized.endsWith("/") ? normalized.substring(0, normalized.length() - 1) : normalized) + "/";
        return files.keySet().stream().anyMatch(file -> file.startsWith(prefix));
    }

    public static String normalizePath(String path) {
        List<String> segments = new ArrayList<>();
        for (String segment : path.replaceAll("/+", "/").split("/", -1)) {
            if (segment.isEmpty() || segment.equals(".")) {
                continue;
            }
            if (segment.equals("..")) {
                if (!segments.isEmpty()) {
                    segments.removeLast();
                }
            } else {
                segments.add(segment);
            }
        }
        return "/" + String.join("/", segments);
    }
}
