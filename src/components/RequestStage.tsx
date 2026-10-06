import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { ArrowRight, BookOpen, Check, CircleX, Copy, File, Globe2, HardDrive, Pause, Play, RotateCw, Server, StepForward } from 'lucide-react'
import { useLab } from '../store/useLab'
import type { TraceKind } from '../sim/request'
import { IconButton, Panel } from './Panel'

const iconFor: Record<TraceKind, typeof Globe2> = { request: Globe2, server: Server, location: RotateCw, rewrite: RotateCw, filesystem: HardDrive, proxy: ArrowRight, response: File }

export function RequestStage() {
  const [copied, setCopied] = useState(false)
  const response = useLab((state) => state.response)
  const visible = useLab((state) => state.visibleTraceSteps)
  const playing = useLab((state) => state.playing)
  const toggle = useLab((state) => state.togglePlaying)
  const step = useLab((state) => state.stepTrace)
  const finish = useLab((state) => state.finishTrace)

  useEffect(() => {
    if (!playing || !response || visible >= response.trace.length) return
    const timer = window.setTimeout(() => useLab.setState({ visibleTraceSteps: visible + 1 }), 650)
    return () => window.clearTimeout(timer)
  }, [playing, response, visible])

  useEffect(() => {
    if (response && visible >= response.trace.length && playing) useLab.setState({ playing: false })
  }, [playing, response, visible])

  const shown = response?.trace.slice(0, visible) ?? []
  const current = shown.at(-1)

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
      <IconButton label={playing ? 'Pausar animação' : 'Continuar animação'} onClick={toggle} active={playing}>{playing ? <Pause size={14} /> : <Play size={14} />}</IconButton>
      <IconButton label="Avançar um passo" onClick={() => step()}><StepForward size={14} /></IconButton>
      <button type="button" className="skip-button" onClick={finish}>ver tudo</button>
    </>}>
      <div className="stage-canvas">
        <div className="stage-grid" />
        {!response ? <EmptyStage /> : <>
          <div className="request-summary">
            <span className={`status-code status-${Math.floor(response.status / 100)}xx`}>{response.status}</span>
            <div><strong>{response.trace[0]?.title}</strong><span>{response.serverId ?? 'aguardando server'} · {response.location ?? 'sem location'}</span></div>
          </div>
          <div className="trace-flow">
            {shown.map((trace, index) => {
              const Icon = iconFor[trace.kind]
              return <motion.article key={`${trace.title}-${index}`} className={`trace-card trace-${trace.status}`} initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.28 }}>
                <span className="trace-icon"><Icon size={15} /></span>
                <div><div className="trace-title">{trace.title}{trace.status === 'success' || trace.status === 'match' ? <Check size={12} /> : trace.status === 'error' || trace.status === 'miss' ? <CircleX size={12} /> : null}</div><p>{trace.detail}</p>{trace.line && <span className="trace-line">linha {trace.line}</span>}</div>
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
