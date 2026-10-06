export interface BackendRequest {
  method: string
  path: string
  headers: Record<string, string>
}

export interface BackendResponse {
  status: number
  headers?: Record<string, string>
  body: string
  delayMs?: number
}

export interface SimulatedBackend {
  address: string
  available?: boolean
  respond: (request: BackendRequest) => BackendResponse
}

export class BackendPool {
  private readonly backends = new Map<string, SimulatedBackend>()
  private readonly cursors = new Map<string, number>()

  constructor(backends: SimulatedBackend[] = []) {
    for (const backend of backends) this.backends.set(backend.address, backend)
  }

  request(group: string, addresses: string[], request: BackendRequest) {
    const weighted = addresses.flatMap((address) => {
      const [name, rawWeight] = address.split('|')
      return Array.from({ length: Number(rawWeight ?? 1) }, () => name ?? '')
    })
    const cursor = this.cursors.get(group) ?? 0
    for (let offset = 0; offset < weighted.length; offset += 1) {
      const index = (cursor + offset) % weighted.length
      const address = weighted[index]!
      const backend = this.backends.get(address)
      if (backend && backend.available !== false) {
        this.cursors.set(group, (index + 1) % weighted.length)
        return { address, response: backend.respond(request) }
      }
    }
    return undefined
  }
}
