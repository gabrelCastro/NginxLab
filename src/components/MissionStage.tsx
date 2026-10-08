import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Globe2, RotateCw } from 'lucide-react'
import { missionScenarios } from '../missions/catalog'
import { useLab } from '../store/useLab'
import { Panel } from './Panel'
import { RequestStage } from './RequestStage'

export function MissionStage() {
  const [view, setView] = useState<'browser' | 'trace'>('browser')
  const reduceMotion = useReducedMotion()
  const stage = useLab((state) => state.missionStage)
  const variant = useLab((state) => state.missionVariant)
  const home = useLab((state) => state.missionHomeResponse)
  const image = useLab((state) => state.missionImageResponse)
  const extra = useLab((state) => state.missionExtraResponse)
  const fallback = useLab((state) => state.missionFallbackResponse)
  const browse = useLab((state) => state.browseShop)
  const selectResponse = useLab((state) => state.selectMissionResponse)
  const scenario = missionScenarios[variant]
  const canInspect = !['observe', 'predict'].includes(stage)

  useEffect(() => {
    if (stage === 'investigate') setView('trace')
    if (stage === 'observe' || stage === 'transfer' || stage === 'integration') setView('browser')
  }, [stage, variant])

  const imageSrc = image?.status === 200 && image.headers['Content-Type'] === 'image/svg+xml'
    ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(image.body)}`
    : 'data:image/png;base64,broken'
  const page = home?.status === 200 && home.filePath === '/srv/loja/index.html'
    ? home.body.replace('{{IMAGE_SRC}}', imageSrc)
    : '<!doctype html><html lang="pt-BR"><body style="font:16px system-ui;padding:32px;background:#f7f4ef"><h1>Não foi possível abrir a loja</h1><p>A página inicial não respondeu com o arquivo esperado.</p></body></html>'

  const inspect = (which: 'home' | 'image' | 'extra' | 'fallback') => {
    selectResponse(which)
    if (canInspect) {
      setView('trace')
      document.getElementById('mission-tab-trace')?.focus()
    }
  }

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canInspect || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'Home' ? 'browser' : event.key === 'End' ? 'trace' : view === 'browser' ? 'trace' : 'browser'
    setView(next)
    document.getElementById(`mission-tab-${next}`)?.focus()
  }

  return (
    <div className="mission-stage">
      <div className="mission-stage-tabs" role="tablist" aria-label="Ambiente da missão" onKeyDown={onTabKeyDown}>
        <button type="button" id="mission-tab-browser" role="tab" aria-selected={view === 'browser'} tabIndex={view === 'browser' ? 0 : -1} className={view === 'browser' ? 'selected' : ''} onClick={() => setView('browser')}>
          <Globe2 size={14} /> Loja
        </button>
        <button type="button" id="mission-tab-trace" role="tab" aria-selected={view === 'trace'} tabIndex={view === 'trace' ? 0 : -1} className={view === 'trace' ? 'selected' : ''} disabled={!canInspect} onClick={() => setView('trace')}>
          Mapa da requisição
        </button>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          id={`mission-view-${view}`}
          className="mission-stage-view"
          role="tabpanel"
          aria-labelledby={`mission-tab-${view}`}
          initial={reduceMotion ? false : { opacity: 0, y: 7 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: -5 }}
          transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        >
          {view === 'browser' ? (
            <Panel title="Verde & Co. / catálogo" eyebrow="Navegador simulado" className="shop-panel" actions={<button type="button" className="mission-refresh" onClick={browse} aria-label="Recarregar loja"><RotateCw size={14} /> Recarregar</button>}>
              {home ? (
                <>
                  <div className="shop-address"><Globe2 size={14} /><span>http://{scenario.host ?? 'localhost'}/</span><ResponseCode status={home.status} /></div>
                  <iframe title="Loja simulada" sandbox="allow-scripts" srcDoc={page} className="shop-frame" />
                  <div className="shop-resources">
                    <button type="button" onClick={() => inspect('home')} disabled={!canInspect}><ResponseCode status={home.status} /> GET /</button>
                    <button type="button" onClick={() => inspect('image')} disabled={!canInspect}><ResponseCode status={image?.status} /> GET {scenario.imageUri}</button>
                    {scenario.extraUri && <button type="button" onClick={() => inspect('extra')} disabled={!canInspect}><ResponseCode status={extra?.status} /> GET {scenario.extraUri}</button>}
                    {scenario.fallbackHost && <button type="button" onClick={() => inspect('fallback')} disabled={!canInspect}><ResponseCode status={fallback?.status} expected={scenario.expectedFallbackStatus ?? 404} /> GET / · Host: {scenario.fallbackHost}</button>}
                  </div>
                </>
              ) : (
                <div className="shop-empty"><Globe2 size={29} /><h3>A loja está pronta para abrir</h3><p>Use o botão “Abrir a loja” na missão. O navegador e os recursos serão atendidos pelo simulador.</p></div>
              )}
            </Panel>
          ) : <RequestStage />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function ResponseCode({ status, expected = 200 }: { status: number | undefined; expected?: number }) {
  const reduceMotion = useReducedMotion()
  return (
    <motion.span
      key={status ?? 'pending'}
      className={`shop-response-code ${status !== undefined && status !== expected ? 'bad' : ''}`}
      initial={reduceMotion ? false : { opacity: 0, scale: 0.82 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.26, ease: [0.22, 1, 0.36, 1] }}
    >{status ?? '—'}</motion.span>
  )
}
