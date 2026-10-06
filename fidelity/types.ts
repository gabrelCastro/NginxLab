import type { FileSeed } from '../src/sim/fs'
import type { SimulatedRequest } from '../src/sim/request'

export interface RequestCase {
  id: string
  config: string
  files: FileSeed
  requests: SimulatedRequest[]
}

export interface ConfigCase {
  id: string
  config: string
}

export interface RecordedResponse {
  status: number
  headers: Record<string, string>
  body: string
}

export interface RequestRecording {
  id: string
  responses: RecordedResponse[]
}

export interface ConfigRecording {
  id: string
  output: string[]
}
