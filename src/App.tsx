import { useEffect, useRef, type CSSProperties } from 'react'
import { ConfigEditor } from './components/ConfigEditor'
import { ExternalNotice } from './components/ExternalNotice'
import { LessonPanel } from './components/LessonPanel'
import { MissionPanel } from './components/MissionPanel'
import { MissionStage } from './components/MissionStage'
import { RequestStage } from './components/RequestStage'
import { ResizeHandle } from './components/ResizeHandle'
import { SyncConflicts } from './components/SyncConflicts'
import { Terminal } from './components/Terminal'
import { TopBar } from './components/TopBar'
import { defaultLayout, layoutLimits, useLayout } from './store/layout'
import { useLab } from './store/useLab'

export function App() {
  const mode = useLab((state) => state.mode)
  const reset = useLab((state) => state.resetLesson)
  const toggle = useLab((state) => state.togglePlaying)
  const step = useLab((state) => state.stepTrace)
  const layout = useLayout()
  const workspace = useRef<HTMLElement>(null)
  const leftColumn = useRef<HTMLDivElement>(null)
  // As porcentagens do grid são da área de conteúdo (sem o padding do container).
  const percentX = (clientX: number) => {
    const element = workspace.current!
    const rect = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const start = rect.left + parseFloat(style.paddingLeft)
    const width = rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
    return (clientX - start) / width * 100
  }
  const percentY = (clientY: number) => {
    const rect = leftColumn.current!.getBoundingClientRect()
    return (clientY - rect.top) / rect.height * 100
  }
  const sizes = { '--layout-left': `${layout.left}%`, '--layout-right': `${layout.right}%`, '--layout-editor': `${layout.editor}%` } as CSSProperties

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return
      if (event.key === '/') {
        event.preventDefault()
        window.dispatchEvent(new Event('nginxlearn:focus-terminal'))
      } else if (event.key === ' ') {
        event.preventDefault()
        toggle()
      } else if (event.key === '.') step()
      else if (event.key.toLowerCase() === 'r') reset()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [reset, step, toggle])

  return <div className="app-shell"><TopBar /><SyncConflicts /><ExternalNotice /><main id="main" ref={workspace} className="workspace" style={sizes}>
    <div className="left-column" ref={leftColumn}>
      <ConfigEditor />
      <ResizeHandle label="Altura do editor e do terminal" orientation="horizontal" value={layout.editor} min={layoutLimits.editor[0]} max={layoutLimits.editor[1]} fromPointer={(_, y) => percentY(y)} onChange={(editor) => layout.set({ editor })} onReset={() => layout.set({ editor: defaultLayout.editor })} />
      <Terminal />
    </div>
    <ResizeHandle label="Largura do editor" orientation="vertical" value={layout.left} min={layoutLimits.left[0]} max={Math.min(layoutLimits.left[1], 100 - layoutLimits.stageMin - layout.right)} fromPointer={(x) => percentX(x)} onChange={(left) => layout.set({ left })} onReset={() => layout.set({ left: defaultLayout.left })} />
    {mode === 'mission' ? <MissionStage /> : <RequestStage />}
    <ResizeHandle label="Largura do painel da lição" orientation="vertical" value={100 - layout.right} min={Math.max(100 - layoutLimits.right[1], layout.left + layoutLimits.stageMin)} max={100 - layoutLimits.right[0]} fromPointer={(x) => percentX(x)} onChange={(position) => layout.set({ right: 100 - position })} onReset={() => layout.set({ right: defaultLayout.right })} />
    {mode === 'mission' ? <MissionPanel /> : <LessonPanel />}
  </main></div>
}
