export type TokenKind = 'word' | 'string' | 'open' | 'close' | 'semicolon'

export interface Token {
  kind: TokenKind
  value: string
  line: number
  column: number
}

export interface DirectiveNode {
  name: string
  args: string[]
  argLines: number[]
  line: number
  endLine: number
  children?: DirectiveNode[]
}

export interface ParseError {
  message: string
  line: number
}

export type ParseResult =
  | { ok: true; directives: DirectiveNode[] }
  | { ok: false; error: ParseError }
