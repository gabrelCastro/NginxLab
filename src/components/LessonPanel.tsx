import { useState } from 'react'
import { Check, ChevronRight, Circle, ExternalLink, Lightbulb, LockKeyhole, Monitor } from 'lucide-react'
import { lessons } from '../lessons'
import { useLab } from '../store/useLab'
import { Panel } from './Panel'

export function LessonPanel() {
  const [tab, setTab] = useState<'mission' | 'article'>('mission')
  const [hintCount, setHintCount] = useState(0)
  const index = useLab((state) => state.lessonIndex)
  const events = useLab((state) => state.events)
  const response = useLab((state) => state.response)
  const selectLesson = useLab((state) => state.selectLesson)
  const lesson = lessons[index]!
  const done = lesson.objectives.map((objective) => objective.verify(events))
  const complete = done.every(Boolean)

  return (
    <Panel title={`${lesson.number}. ${lesson.title}`} eyebrow={lesson.eyebrow} className="lesson-panel">
      <div className="lesson-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'mission'} className={tab === 'mission' ? 'selected' : ''} onClick={() => setTab('mission')}>Missão</button>
        <button type="button" role="tab" aria-selected={tab === 'article'} className={tab === 'article' ? 'selected' : ''} onClick={() => setTab('article')}>Apostila</button>
      </div>
      <div className="lesson-content">
        {tab === 'mission' ? <>
          <p className="lesson-idea">{lesson.idea}</p>
          <h3 className="section-label">Objetivos</h3>
          <div className="objective-list">
            {lesson.objectives.map((objective, objectiveIndex) => <div className={done[objectiveIndex] ? 'objective done' : 'objective'} key={objective.id}>{done[objectiveIndex] ? <Check size={14} /> : <Circle size={14} />}<span>{objective.label}</span></div>)}
          </div>
          {complete && <div className="completion-card"><Check size={17} /><div><strong>Lição concluída</strong><span>Você provou isso pelo estado do simulador.</span></div>{index < lessons.length - 1 && <button type="button" onClick={() => selectLesson(index + 1)}>Próxima <ChevronRight size={14} /></button>}</div>}
          <div className="hint-area">
            <button type="button" className="hint-button" onClick={() => setHintCount(Math.min(lesson.hints.length, hintCount + 1))}><Lightbulb size={14} /> Travou? {hintCount ? 'Outra dica' : 'Ver uma dica'}</button>
            {lesson.hints.slice(0, hintCount).map((hint, hintIndex) => <p key={hint} className="hint"><span>{hintIndex + 1}</span>{hint}</p>)}
          </div>
          {lesson.number <= 2 && response?.headers['Content-Type']?.includes('text/html') && response.status === 200 && <div className="browser-preview"><div className="browser-bar"><span /><span /><span /><Monitor size={12} /> localhost</div><iframe title="Navegador simulado" sandbox="allow-scripts" srcDoc={response.body} /></div>}
          <div className="shortcut-card"><LockKeyhole size={13} /><span><kbd>/</kbd> terminal · <kbd>Espaço</kbd> pausar · <kbd>.</kbd> avançar · <kbd>r</kbd> reiniciar</span></div>
        </> : <article className="article">
          {lesson.article.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          <h3>Referência oficial</h3>
          {lesson.article.links.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={12} /></a>)}
        </article>}
      </div>
    </Panel>
  )
}
