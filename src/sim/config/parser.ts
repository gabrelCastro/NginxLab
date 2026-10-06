import { tokenize } from './tokenizer'
import type { DirectiveNode, ParseResult, Token } from './types'

export function parseConfig(source: string): ParseResult {
  const tokenized = tokenize(source)
  if (!tokenized.ok) return tokenized
  const tokens = tokenized.tokens
  const lastLine = tokenized.lastLine
  let cursor = 0

  function parseLevel(inBlock: boolean, openingLine = 1): ParseResult {
    const directives: DirectiveNode[] = []
    while (cursor < tokens.length) {
      const first = tokens[cursor]!
      if (first.kind === 'close') {
        if (!inBlock) return fail('unexpected "}"', first.line)
        cursor += 1
        return { ok: true, directives }
      }
      if (first.kind !== 'word' && first.kind !== 'string') {
        return fail(`unexpected "${first.value}"`, first.line)
      }
      cursor += 1
      const args: Token[] = []
      while (cursor < tokens.length) {
        const token = tokens[cursor]!
        if (token.kind === 'word' || token.kind === 'string') {
          args.push(token)
          cursor += 1
          continue
        }
        if (token.kind === 'semicolon') {
          cursor += 1
          directives.push({
            name: first.value,
            args: args.map((argument) => argument.value),
            argLines: args.map((argument) => argument.line),
            line: first.line,
            endLine: token.line
          })
          break
        }
        if (token.kind === 'open') {
          cursor += 1
          const parsed = parseLevel(true, token.line)
          if (!parsed.ok) return parsed
          const closeLine = tokens[cursor - 1]?.line ?? token.line
          directives.push({
            name: first.value,
            args: args.map((argument) => argument.value),
            argLines: args.map((argument) => argument.line),
            line: first.line,
            endLine: closeLine,
            children: parsed.directives
          })
          break
        }
        return fail('unexpected "}"', token.line)
      }
      if (cursor >= tokens.length) {
        const last = directives.at(-1)
        const currentWasAdded = last?.line === first.line
        if (!currentWasAdded) {
          return fail(inBlock ? 'unexpected end of file, expecting "}"' : 'unexpected end of file, expecting ";"', lastLine)
        }
      }
    }
    if (inBlock) return fail('unexpected end of file, expecting "}"', Math.max(openingLine, lastLine))
    return { ok: true, directives }
  }

  return parseLevel(false)
}

function fail(message: string, line: number): ParseResult {
  return { ok: false, error: { message, line } }
}
