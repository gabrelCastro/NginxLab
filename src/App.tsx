import { useEffect } from 'react'
import { ConfigEditor } from './components/ConfigEditor'
import { LessonPanel } from './components/LessonPanel'
import { RequestStage } from './components/RequestStage'
import { Terminal } from './components/Terminal'
import { TopBar } from './components/TopBar'
import { useLab } from './store/useLab'

export function App() {
  const reset = useLab((state) => state.resetLesson)
  const toggle = useLab((state) => state.togglePlaying)
  const step = useLab((state) => state.stepTrace)

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

  return <div className="app-shell"><TopBar /><main id="main" className="workspace"><div className="left-column"><ConfigEditor /><Terminal /></div><RequestStage /><LessonPanel /></main></div>
}
