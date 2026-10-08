import { useRef } from 'react'
import { Check, Map } from 'lucide-react'
import { lessons } from '../lessons'
import { campaign } from '../lessons/campaign'
import { useLab } from '../store/useLab'

export function CampaignMap() {
  const details = useRef<HTMLDetailsElement>(null)
  const mode = useLab((state) => state.mode)
  const current = useLab((state) => state.lessonIndex)
  const completed = useLab((state) => state.completedLessons)
  const attempts = useLab((state) => state.missionAttempts)
  const variant = useLab((state) => state.missionVariant)
  const integrationCompletions = useLab((state) => state.missionIntegrationCompletions)
  const selectLesson = useLab((state) => state.selectLesson)
  const openMission = useLab((state) => state.openMission)
  const restartMission = useLab((state) => state.restartMission)
  const startIntegration = useLab((state) => state.startIntegration)

  const choose = (index: number) => {
    selectLesson(index)
    if (details.current) details.current.open = false
  }

  return <details className="campaign-menu" ref={details} onKeyDown={(event) => { if (event.key === 'Escape' && details.current) details.current.open = false }}>
    <summary><Map size={14} /> Trilha da loja</summary>
    <nav className="campaign-menu-content" aria-label="Capítulos da loja">
      <p>Construa a Verde & Co. capítulo por capítulo. Cada bancada abre em um checkpoint conhecido; os conceitos seguem com você.</p>
      {lessons.map((lesson, index) => <button type="button" key={lesson.id} className={mode === 'lesson' && current === index ? 'current' : ''} onClick={() => choose(index)}><span className="campaign-number">{completed.includes(lesson.id) ? <Check size={12} /> : String(index + 1).padStart(2, '0')}</span><span><strong>{campaign[lesson.id]!.title}</strong><small>{lesson.title}</small></span></button>)}
      <button type="button" className={mode === 'mission' && variant !== 'integration' ? 'current' : ''} onClick={() => { if (variant === 'integration') restartMission(); else openMission(); if (details.current) details.current.open = false }}><span className="campaign-number">{attempts.length ? <Check size={12} /> : '★'}</span><span><strong>Incidente: imagens da loja</strong><small>{variant === 'integration' ? 'Refazer a missão de caminhos e arquivos' : 'Prática independente após caminhos e arquivos'}</small></span></button>
      {attempts.length > 0 && <button type="button" className={mode === 'mission' && variant === 'integration' ? 'current' : ''} onClick={() => { if (variant === 'integration') openMission(); else startIntegration(); if (details.current) details.current.open = false }}><span className="campaign-number">{integrationCompletions ? <Check size={12} /> : '◆'}</span><span><strong>Incidente: duas rotas falham</strong><small>Revisão de server, location, alias e try_files</small></span></button>}
    </nav>
  </details>
}
