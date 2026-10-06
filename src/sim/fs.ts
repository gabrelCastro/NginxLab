export interface VirtualFile {
  content: string
  contentType?: string
}

export type FileSeed = Record<string, string | VirtualFile>

export class VirtualFileSystem {
  private readonly files = new Map<string, VirtualFile>()

  constructor(seed: FileSeed = {}) {
    for (const [path, file] of Object.entries(seed)) {
      this.files.set(normalizePath(path), typeof file === 'string' ? { content: file } : file)
    }
  }

  read(path: string) {
    return this.files.get(normalizePath(path))
  }

  exists(path: string) {
    return this.files.has(normalizePath(path))
  }

  isDirectory(path: string) {
    const prefix = `${normalizePath(path).replace(/\/$/, '')}/`
    return [...this.files.keys()].some((file) => file.startsWith(prefix))
  }

  list(path: string) {
    const normalized = normalizePath(path).replace(/\/$/, '')
    const prefix = normalized === '/' ? '/' : `${normalized}/`
    return [...new Set([...this.files.keys()]
      .filter((file) => file.startsWith(prefix))
      .map((file) => file.slice(prefix.length).split('/')[0])
      .filter((name): name is string => Boolean(name)))]
      .sort()
  }
}

export function normalizePath(path: string) {
  const segments: string[] = []
  for (const segment of path.replace(/\/+/g, '/').split('/')) {
    if (!segment || segment === '.') continue
    if (segment === '..') segments.pop()
    else segments.push(segment)
  }
  return `/${segments.join('/')}`
}
