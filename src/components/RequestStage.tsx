import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ArrowRight, BookOpen, Check, CircleX, Copy, File, Globe2, HardDrive, Pause, Play, RotateCw, Server, StepForward } from 'lucide-react'
import { useLab } from '../store/useLab'
import type { TraceKind } from '../sim/request'
import { IconButton, Panel } from './Panel'

const iconFor: Record<TraceKind, typeof Globe2> = { request: Globe2, server: Server, location: RotateCw, rewrite: RotateCw, filesystem: HardDrive, proxy: ArrowRight, response: File }
type RoutePhase = 'client' | 'nginx' | 'resource' | 'result'

function phaseFor(kind: TraceKind): RoutePhase {
  if (kind === 'request') return 'client'
  if (kind === 'filesystem' || kind === 'proxy') return 'resource'
  if (kind === 'response') return 'result'
  return 'nginx'
}

export function RequestStage() {
  const [copied, setCopied] = useState(false)
  const response = useLab((state) => state.response)
  const commandCount = useLab((state) => state.session.commandCount)
  const visible = useLab((state) => state.visibleTraceSteps)
  const playing = useLab((state) => state.playing)
  const toggle = useLab((state) => state.togglePlaying)
  const step = useLab((state) => state.stepTrace)
  const finish = useLab((state) => state.finishTrace)
  const focusLine = useLab((state) => state.focusTraceLine)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    if (reduceMotion || !playing || !response || visible >= response.trace.length) return
    const timer = window.setTimeout(() => useLab.setState({ visibleTraceSteps: visible + 1 }), 620)
    return () => window.clearTimeout(timer)
  }, [playing, reduceMotion, response, visible])

  useEffect(() => {
    if (reduceMotion && response && visible < response.trace.length) useLab.setState({ visibleTraceSteps: response.trace.length, playing: false })
  }, [reduceMotion, response, visible])

  useEffect(() => {
    if (response && visible >= response.trace.length && playing) useLab.setState({ playing: false })
  }, [playing, response, visible])

  const shown = response?.trace.slice(0, visible) ?? []
  const current = shown.at(-1)
  const total = response?.trace.length ?? 0
  const finished = !!response && visible >= total
  const canAdvance = !!response && !finished
  const hasResource = response?.trace.some((trace) => trace.kind === 'filesystem' || trace.kind === 'proxy') ?? false
  const route: { id: RoutePhase; label: string; icon: typeof Globe2 }[] = [
    { id: 'client', label: 'Cliente', icon: Globe2 },
    { id: 'nginx', label: 'nginx', icon: Server },
    ...(hasResource ? [{ id: 'resource' as const, label: response?.trace.some((trace) => trace.kind === 'proxy') ? 'Backend / cache' : 'Disco virtual', icon: HardDrive }] : []),
    { id: 'result', label: 'Resposta', icon: File }
  ]
  const activePhase = finished ? 'result' : current ? phaseFor(current.kind) : undefined
  const activeRouteIndex = route.findIndex((item) => item.id === activePhase)
  const routeProgress = activeRouteIndex < 0 ? 0 : activeRouteIndex / (route.length - 1) * 100
  const serverSeen = shown.some((trace) => trace.kind === 'server')
  const locationSeen = shown.some((trace) => trace.kind === 'location')
  const animationRunKey = `${commandCount}:${response?.trace[0]?.title ?? ''}:${response?.status ?? ''}:${response?.serverId ?? ''}`

  const copyTrace = async () => {
    if (!response) return
    const text = response.trace.map((trace) => `${trace.title}\n${trace.detail}${trace.line ? `\nlinha ${trace.line}` : ''}`).join('\n\n')
    await copyText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1_500)
  }

  return (
    <Panel title="Caminho da requisição" eyebrow="Palco" className="stage-panel" actions={<>
      {response && <IconButton label={copied ? 'Trace copiado' : 'Copiar trace'} onClick={() => void copyTrace()} active={copied}>{copied ? <Check size={14} /> : <Copy size={14} />}</IconButton>}
      <IconButton label={playing && canAdvance ? 'Pausar animação' : 'Continuar animação'} onClick={toggle} active={playing && canAdvance} disabled={!canAdvance}>{playing && canAdvance ? <Pause size={14} /> : <Play size={14} />}</IconButton>
      <IconButton label="Avançar um passo" onClick={() => step()} disabled={!canAdvance}><StepForward size={14} /></IconButton>
      <button type="button" className="skip-button" onClick={finish} disabled={!canAdvance}>ver tudo</button>
    </>}>
      <div className="stage-canvas">
        <div className="stage-grid" />
        {!response ? <EmptyStage /> : <>
          <div className={`request-summary ${finished ? 'is-finished' : ''}`}>
            <span className={`status-code ${finished ? `status-${Math.floor(response.status / 100)}xx` : 'status-pending'}`} role="status" aria-live="polite" aria-label={finished ? `Resposta HTTP ${response.status}` : 'Resposta ainda não revelada'}>{finished ? response.status : '···'}</span>
            <div><strong>{response.trace[0]?.title}</strong><span>{serverSeen ? response.serverId ?? 'nenhum server' : 'selecionando server'} · {locationSeen || finished ? response.location ?? 'sem location' : 'selecionando location'}</span></div>
          </div>
          <div className={`request-map ${finished && response.status >= 400 ? 'has-error' : ''}`} role="group" aria-label="Caminho da requisição">
            <div className="request-map-track" aria-hidden="true" style={{ left: `${50 / route.length}%`, right: `${50 / route.length}%` }}>
              <motion.span key={`${animationRunKey}:fill`} className="request-map-fill" initial={false} animate={{ width: `${routeProgress}%` }} transition={{ duration: reduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }} />
              {activeRouteIndex >= 0 && <motion.span key={`${animationRunKey}:packet`} className="request-map-packet" initial={false} animate={{ left: `${routeProgress}%` }} transition={{ duration: reduceMotion ? 0 : 0.42, ease: [0.22, 1, 0.36, 1] }} />}
            </div>
            <ol style={{ gridTemplateColumns: `repeat(${route.length}, minmax(0, 1fr))` }}>
              {route.map((item, index) => {
                const Icon = item.icon
                return <li key={item.id} className={index === activeRouteIndex ? 'active' : index < activeRouteIndex ? 'visited' : ''} aria-current={index === activeRouteIndex ? 'step' : undefined}>
                  <span className="request-map-node"><Icon size={15} /></span>
                  <span className="request-map-label">{item.label}{item.id === 'result' && finished ? ` ${response.status}` : ''}</span>
                </li>
              })}
            </ol>
          </div>
          <div className="trace-playback">
            <div className="trace-playback-label"><span>{finished ? 'Percurso concluído' : playing ? 'Acompanhando requisição' : 'Percurso pausado'}</span><span>Etapa {Math.min(visible, total)} de {total}</span></div>
            <div className="trace-playback-track" role="progressbar" aria-label="Etapas da requisição" aria-valuemin={0} aria-valuemax={total} aria-valuenow={Math.min(visible, total)}>
              <motion.span key={`${animationRunKey}:steps`} initial={false} animate={{ width: `${total ? visible / total * 100 : 0}%` }} transition={{ duration: reduceMotion ? 0 : 0.3 }} />
            </div>
          </div>
          <div className="trace-flow">
            {shown.map((trace, index) => {
              const Icon = iconFor[trace.kind]
              return <motion.article key={`${trace.title}-${index}`} className={`trace-card trace-${trace.status} ${index === shown.length - 1 ? 'trace-current' : ''}`} initial={reduceMotion ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduceMotion ? 0 : 0.32, ease: [0.22, 1, 0.36, 1] }}>
                <span className="trace-icon"><Icon size={15} /></span>
                <div><div className="trace-title">{trace.title}{trace.status === 'success' || trace.status === 'match' ? <Check size={12} /> : trace.status === 'error' || trace.status === 'miss' ? <CircleX size={12} /> : null}</div><p>{trace.detail}</p>{trace.line && <button type="button" className="trace-line" onClick={() => focusLine(trace.line!)}>Ver configuração · linha {trace.line}</button>}</div>
              </motion.article>
            })}
          </div>
          {current && visible < response.trace.length && <div className="next-step">próximo: {response.trace[visible]?.title}</div>}
        </>}
      </div>
    </Panel>
  )
}

function EmptyStage() {
  return <div className="empty-stage"><div className="empty-orbit"><span /></div><Globe2 size={24} /><h3>O palco está pronto</h3><p>Comece pelo passo marcado “Agora”. Quando a aula pedir uma requisição, cada decisão do nginx aparecerá aqui.</p><div className="stage-guide-cue"><BookOpen size={14} /><span>Siga o passo a passo à direita</span></div></div>
}

async function copyText(text: string) {
  try {
    if (!navigator.clipboard) throw new Error('Clipboard API unavailable')
    await navigator.clipboard.writeText(text)
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.append(field)
    field.select()
    document.execCommand('copy')
    field.remove()
  }
}
