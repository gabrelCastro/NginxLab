import { Check, ChevronDown, RotateCcw, Server } from 'lucide-react'
import { lessons } from '../lessons'
import { useLab } from '../store/useLab'
import { CampaignMap } from './CampaignMap'
import { SyncStatus } from './SyncStatus'

export function TopBar() {
  const mode = useLab((state) => state.mode)
  const missionVariant = useLab((state) => state.missionVariant)
  const lessonIndex = useLab((state) => state.lessonIndex)
  const completed = useLab((state) => state.completedLessons)
  const selectLesson = useLab((state) => state.selectLesson)
  const reset = useLab((state) => state.resetLesson)
  const openMission = useLab((state) => state.openMission)
  const lesson = lessons[lessonIndex]!

  return (
    <header className="topbar">
      <a className="brand" href="#main" aria-label="NginxLearn — ir para o laboratório">
        <span className="brand-mark"><Server size={17} /></span>
        <span><strong>Nginx</strong>Learn</span>
      </a>
      <button className={`mission-nav-button ${mode === 'mission' ? 'selected' : ''}`} type="button" onClick={openMission}>{missionVariant === 'integration' ? 'Missão: revisão integrada' : 'Missão: imagens da loja'}</button>
      <CampaignMap />
      <div className="lesson-select-wrap">
        <label htmlFor="lesson-select" className="sr-only">Escolher lição</label>
        <select id="lesson-select" className="lesson-select" value={mode === 'mission' ? 'mission' : lessonIndex} onChange={(event) => selectLesson(Number(event.target.value))}>
          {mode === 'mission' && <option value="mission">Explorar as lições</option>}
          {lessons.map((item, index) => <option key={item.id} value={index}>{completed.includes(item.id) ? '✓ ' : ''}{item.number}. {item.title}</option>)}
        </select>
        <ChevronDown className="select-chevron" size={15} aria-hidden="true" />
      </div>
      {mode === 'lesson' && <div className="topbar-progress" aria-label={`${completed.length} de ${lessons.length} lições concluídas`}>
        <div className="progress-dots" aria-hidden="true">
          {lessons.map((item) => <span key={item.id} className={completed.includes(item.id) ? 'done' : item.id === lesson.id ? 'current' : ''}>{completed.includes(item.id) && <Check size={9} />}</span>)}
        </div>
        <span>{completed.length}/{lessons.length}</span>
      </div>}
      <SyncStatus />
      <button className="text-button" type="button" onClick={reset}><RotateCcw size={14} /> {mode === 'mission' ? 'Refazer missão' : 'Reiniciar'}</button>
    </header>
  )
}
