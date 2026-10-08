// O PostgreSQL devolve JSONB com as chaves reordenadas; comparar versões exige
// uma serialização canônica, independente da ordem de inserção.
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((item) => item === undefined ? 'null' : stableStringify(item)).join(',')}]`
  const entries = Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
}

// cyrb53 com o tamanho do texto: suficiente para detectar mudanças, não é uma proteção criptográfica.
export function fingerprint(value: unknown) {
  const text = stableStringify(value)
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return `${text.length.toString(36)}-${(h2 >>> 0).toString(36)}${(h1 >>> 0).toString(36)}`
}
