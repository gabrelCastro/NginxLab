import { useRef, type KeyboardEvent, type PointerEvent } from 'react'

interface ResizeHandleProps {
  label: string
  orientation: 'vertical' | 'horizontal'
  value: number
  min: number
  max: number
  // Converte a posição do ponteiro (px na tela) em porcentagem.
  fromPointer: (clientX: number, clientY: number) => number
  onChange: (value: number) => void
  onReset: () => void
}

// Divisor entre painéis: arrastar, setas do teclado (Shift = passo maior), Home/End e duplo clique para restaurar.
export function ResizeHandle({ label, orientation, value, min, max, fromPointer, onChange, onReset }: ResizeHandleProps) {
  const dragging = useRef(false)
  const clamp = (next: number) => Math.min(max, Math.max(min, next))

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    dragging.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    document.body.classList.add(orientation === 'vertical' ? 'resizing-columns' : 'resizing-rows')
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragging.current) onChange(clamp(fromPointer(event.clientX, event.clientY)))
  }
  const stop = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return
    dragging.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    document.body.classList.remove('resizing-columns', 'resizing-rows')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2
    const decrease = orientation === 'vertical' ? 'ArrowLeft' : 'ArrowUp'
    const increase = orientation === 'vertical' ? 'ArrowRight' : 'ArrowDown'
    const next = event.key === decrease ? value - step : event.key === increase ? value + step : event.key === 'Home' ? min : event.key === 'End' ? max : undefined
    if (next === undefined) return
    event.preventDefault()
    onChange(clamp(next))
  }

  return <div
    className={`resize-handle resize-${orientation}`}
    role="separator"
    tabIndex={0}
    aria-label={label}
    aria-orientation={orientation}
    aria-valuenow={Math.round(value)}
    aria-valuemin={min}
    aria-valuemax={max}
    title={`${label} — arraste, use as setas ou dê dois cliques para restaurar`}
    onPointerDown={onPointerDown}
    onPointerMove={onPointerMove}
    onPointerUp={stop}
    onPointerCancel={stop}
    onKeyDown={onKeyDown}
    onDoubleClick={onReset}
  />
}
