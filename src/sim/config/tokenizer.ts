import type { ParseError, Token } from './types'

export type TokenizeResult =
  | { ok: true; tokens: Token[]; lastLine: number }
  | { ok: false; error: ParseError }

const special = new Set(['{', '}', ';'])

export function tokenize(source: string): TokenizeResult {
  const tokens: Token[] = []
  let index = 0
  let line = 1
  let column = 1

  const advance = () => {
    const character = source[index++]
    if (character === '\n') {
      line += 1
      column = 1
    } else {
      column += 1
    }
    return character
  }

  while (index < source.length) {
    const character = source[index]!
    if (/\s/.test(character)) {
      advance()
      continue
    }
    if (character === '#') {
      while (index < source.length && source[index] !== '\n') advance()
      continue
    }
    if (special.has(character)) {
      const kind = character === '{' ? 'open' : character === '}' ? 'close' : 'semicolon'
      tokens.push({ kind, value: character, line, column })
      advance()
      continue
    }
    if (character === '"' || character === "'") {
      const quote = character
      const startLine = line
      const startColumn = column
      advance()
      let value = ''
      let closed = false
      while (index < source.length) {
        const current = advance()
        if (current === quote) {
          closed = true
          break
        }
        if (current === '\\' && index < source.length) {
          const next = advance()
          value += next === 'n' ? '\n' : next
        } else {
          value += current
        }
      }
      if (!closed) return { ok: false, error: { message: 'unexpected end of file, expecting ";"', line: startLine } }
      tokens.push({ kind: 'string', value, line: startLine, column: startColumn })
      continue
    }

    const startLine = line
    const startColumn = column
    let value = ''
    while (index < source.length) {
      const current = source[index]!
      if (/\s/.test(current) || special.has(current) || current === '#') break
      if (current === '\\' && index + 1 < source.length) {
        advance()
        const escaped = advance()
        value += escaped && /[\s{};'"#]/.test(escaped) ? escaped : `\\${escaped}`
      } else {
        value += advance()
      }
    }
    if (value) tokens.push({ kind: 'word', value, line: startLine, column: startColumn })
  }

  return { ok: true, tokens, lastLine: line }
}
