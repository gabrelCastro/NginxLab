import { create } from 'zustand'

// Tamanhos dos painéis (porcentagens). Preferência deste navegador: não é sincronizada.
export interface Layout {
  left: number
  right: number
  editor: number
}

export const defaultLayout: Layout = { left: 25, right: 28, editor: 55 }
export const layoutLimits = { left: [16, 45], right: [18, 42], editor: [20, 82], stageMin: 28 } as const
const key = 'nginxlearn:layout-v1'

function read(): Layout {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? 'null') as Partial<Layout> | null
    if (!parsed) return defaultLayout
    return normalize({ ...defaultLayout, ...Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) })
  } catch {
    return defaultLayout
  }
}

export function normalize(layout: Layout): Layout {
  const clamp = (value: number, [min, max]: readonly [number, number]) => Math.min(max, Math.max(min, value))
  const left = clamp(layout.left, layoutLimits.left)
  // O palco central nunca fica menor que stageMin%.
  const right = Math.min(clamp(layout.right, layoutLimits.right), 100 - layoutLimits.stageMin - left)
  return { left, right, editor: clamp(layout.editor, layoutLimits.editor) }
}

export const useLayout = create<Layout & { set: (patch: Partial<Layout>) => void }>((set, get) => ({
  ...(typeof localStorage === 'undefined' ? defaultLayout : read()),
  set: (patch) => {
    const next = normalize({ left: get().left, right: get().right, editor: get().editor, ...patch })
    set(next)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch { /* Só nesta sessão. */ }
  }
}))
