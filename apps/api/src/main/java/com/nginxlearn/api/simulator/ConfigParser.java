package com.nginxlearn.api.simulator;

import java.util.ArrayList;
import java.util.List;

/**
 * Tokenizador e parser do subconjunto de nginx.conf usado pelo laboratório.
 * Espelha {@code src/sim/config/tokenizer.ts} e {@code parser.ts}; a paridade é
 * verificada por {@code simulator-parity.json}.
 */
public final class ConfigParser {

    public record Directive(String name, List<String> args, List<Integer> argLines, int line, int endLine,
                            List<Directive> children) {
        public boolean isBlock() {
            return children != null;
        }
    }

    public sealed interface ParseResult permits Parsed, ParseFailure {
    }

    public record Parsed(List<Directive> directives) implements ParseResult {
    }

    public record ParseFailure(String message, int line) implements ParseResult {
    }

    private enum Kind { WORD, STRING, OPEN, CLOSE, SEMICOLON }

    private record Token(Kind kind, String value, int line) {
    }

    private record Tokens(List<Token> tokens, int lastLine, ParseFailure failure) {
    }

    private ConfigParser() {
    }

    public static ParseResult parse(String source) {
        Tokens tokenized = tokenize(source);
        if (tokenized.failure() != null) {
            return tokenized.failure();
        }
        return new Parser(tokenized.tokens(), tokenized.lastLine()).level(false, 1);
    }

    static boolean isSpace(char character) {
        return Character.isWhitespace(character) || Character.isSpaceChar(character) || character == '﻿';
    }

    private static boolean isSpecial(char character) {
        return character == '{' || character == '}' || character == ';';
    }

    private static Tokens tokenize(String source) {
        List<Token> tokens = new ArrayList<>();
        int[] position = {0, 1};
        int length = source.length();
        while (position[0] < length) {
            char character = source.charAt(position[0]);
            if (isSpace(character)) {
                advance(source, position);
                continue;
            }
            if (character == '#') {
                while (position[0] < length && source.charAt(position[0]) != '\n') {
                    advance(source, position);
                }
                continue;
            }
            if (isSpecial(character)) {
                Kind kind = character == '{' ? Kind.OPEN : character == '}' ? Kind.CLOSE : Kind.SEMICOLON;
                tokens.add(new Token(kind, String.valueOf(character), position[1]));
                advance(source, position);
                continue;
            }
            if (character == '"' || character == '\'') {
                char quote = character;
                int startLine = position[1];
                advance(source, position);
                StringBuilder value = new StringBuilder();
                boolean closed = false;
                while (position[0] < length) {
                    char current = advance(source, position);
                    if (current == quote) {
                        closed = true;
                        break;
                    }
                    if (current == '\\' && position[0] < length) {
                        char next = advance(source, position);
                        value.append(next == 'n' ? '\n' : next);
                    } else {
                        value.append(current);
                    }
                }
                if (!closed) {
                    return new Tokens(tokens, position[1], new ParseFailure("unexpected end of file, expecting \";\"", startLine));
                }
                tokens.add(new Token(Kind.STRING, value.toString(), startLine));
                continue;
            }
            int startLine = position[1];
            StringBuilder value = new StringBuilder();
            while (position[0] < length) {
                char current = source.charAt(position[0]);
                if (isSpace(current) || isSpecial(current) || current == '#') {
                    break;
                }
                if (current == '\\' && position[0] + 1 < length) {
                    advance(source, position);
                    char escaped = advance(source, position);
                    if (isSpace(escaped) || "{};'\"#".indexOf(escaped) >= 0) {
                        value.append(escaped);
                    } else {
                        value.append('\\').append(escaped);
                    }
                } else {
                    value.append(advance(source, position));
                }
            }
            if (!value.isEmpty()) {
                tokens.add(new Token(Kind.WORD, value.toString(), startLine));
            }
        }
        return new Tokens(tokens, position[1], null);
    }

    private static char advance(String source, int[] position) {
        char character = source.charAt(position[0]++);
        if (character == '\n') {
            position[1]++;
        }
        return character;
    }

    private static final class Parser {
        private final List<Token> tokens;
        private final int lastLine;
        private int cursor;

        Parser(List<Token> tokens, int lastLine) {
            this.tokens = tokens;
            this.lastLine = lastLine;
        }

        ParseResult level(boolean inBlock, int openingLine) {
            List<Directive> directives = new ArrayList<>();
            while (cursor < tokens.size()) {
                Token first = tokens.get(cursor);
                if (first.kind() == Kind.CLOSE) {
                    if (!inBlock) {
                        return new ParseFailure("unexpected \"}\"", first.line());
                    }
                    cursor++;
                    return new Parsed(directives);
                }
                if (first.kind() != Kind.WORD && first.kind() != Kind.STRING) {
                    return new ParseFailure("unexpected \"" + first.value() + "\"", first.line());
                }
                cursor++;
                List<Token> args = new ArrayList<>();
                while (cursor < tokens.size()) {
                    Token token = tokens.get(cursor);
                    if (token.kind() == Kind.WORD || token.kind() == Kind.STRING) {
                        args.add(token);
                        cursor++;
                        continue;
                    }
                    if (token.kind() == Kind.SEMICOLON) {
                        cursor++;
                        directives.add(new Directive(first.value(), values(args), lines(args), first.line(), token.line(), null));
                        break;
                    }
                    if (token.kind() == Kind.OPEN) {
                        cursor++;
                        ParseResult nested = level(true, token.line());
                        if (nested instanceof ParseFailure failure) {
                            return failure;
                        }
                        int closeLine = cursor - 1 >= 0 && cursor - 1 < tokens.size() ? tokens.get(cursor - 1).line() : token.line();
                        directives.add(new Directive(first.value(), values(args), lines(args), first.line(), closeLine,
                                ((Parsed) nested).directives()));
                        break;
                    }
                    return new ParseFailure("unexpected \"}\"", token.line());
                }
                if (cursor >= tokens.size()) {
                    Directive last = directives.isEmpty() ? null : directives.getLast();
                    boolean currentWasAdded = last != null && last.line() == first.line();
                    if (!currentWasAdded) {
                        return new ParseFailure(inBlock ? "unexpected end of file, expecting \"}\"" : "unexpected end of file, expecting \";\"", lastLine);
                    }
                }
            }
            if (inBlock) {
                return new ParseFailure("unexpected end of file, expecting \"}\"", Math.max(openingLine, lastLine));
            }
            return new Parsed(directives);
        }

        private static List<String> values(List<Token> args) {
            return args.stream().map(Token::value).toList();
        }

        private static List<Integer> lines(List<Token> args) {
            return args.stream().map(Token::line).toList();
        }
    }
}
