import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, CheckCircle2, ChevronRight, Circle, Copy, ExternalLink, Eye, Lightbulb, LockKeyhole, Monitor, PencilLine, Play, RotateCcw } from 'lucide-react'
import { lessons, type LessonStep } from '../lessons'
import { useLab } from '../store/useLab'
import { Panel } from './Panel'

export function LessonPanel() {
  const [tab, setTab] = useState<'mission' | 'article'>('mission')
  const [hintCount, setHintCount] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<string[]>([])
  const [verifiedSteps, setVerifiedSteps] = useState<string[]>([])
  const [copiedStep, setCopiedStep] = useState<string>()
  const stepStart = useRef({ key: '', eventCount: 0 })
  const index = useLab((state) => state.lessonIndex)
  const lessonRunId = useLab((state) => state.lessonRunId)
  const events = useLab((state) => state.events)
  const response = useLab((state) => state.response)
  const source = useLab((state) => state.session.draftSource)
  const runCommand = useLab((state) => state.runCommand)
  const setDraft = useLab((state) => state.setDraft)
  const markLessonComplete = useLab((state) => state.markLessonComplete)
  const selectLesson = useLab((state) => state.selectLesson)
  const lesson = lessons[index]!
  const done = lesson.objectives.map((objective) => objective.verify(events))
  const stepDone = lesson.steps.map((step) => completedSteps.includes(step.id))
  const activeStep = stepDone.findIndex((value) => !value)
  const currentStep = activeStep >= 0 ? lesson.steps[activeStep] : undefined
  const guideComplete = activeStep === -1
  const complete = done.every(Boolean) && guideComplete

  useEffect(() => {
    setTab('mission')
    setHintCount(0)
    setCompletedSteps([])
    setVerifiedSteps([])
    setCopiedStep(undefined)
    stepStart.current = { key: '', eventCount: 0 }
  }, [lesson.id, lessonRunId])

  useEffect(() => {
    if (!currentStep?.verify) return
    const key = `${lesson.id}:${currentStep.id}`
    if (stepStart.current.key !== key) {
      stepStart.current = { key, eventCount: events.length }
      return
    }
    if (events.length > stepStart.current.eventCount && currentStep.verify(events)) {
      setVerifiedSteps((current) => current.includes(currentStep.id) ? current : [...current, currentStep.id])
    }
  }, [currentStep, events, lesson.id])

  useEffect(() => {
    if (complete) markLessonComplete(lesson.id)
  }, [complete, lesson.id, markLessonComplete])

  const acknowledge = (id: string) => setCompletedSteps((current) => current.includes(id) ? current : [...current, id])

  const applyStepEdit = (step: LessonStep) => {
    if (!step.applyEdit) return
    setDraft(source.replace(step.applyEdit.search, step.applyEdit.replace))
    setVerifiedSteps((current) => current.includes(step.id) ? current : [...current, step.id])
  }

  const runStepCommand = (step: LessonStep) => {
    if (step.command) runCommand(step.command)
  }

  const copyCommand = async (id: string, command: string) => {
    try {
      await navigator.clipboard.writeText(command)
    } catch {
      const field = document.createElement('textarea')
      field.value = command
      field.style.position = 'fixed'
      field.style.opacity = '0'
      document.body.append(field)
      field.select()
      document.execCommand('copy')
      field.remove()
    }
    setCopiedStep(id)
    window.setTimeout(() => setCopiedStep(undefined), 1_500)
  }

  return (
    <Panel title={`${lesson.number}. ${lesson.title}`} eyebrow={lesson.eyebrow} className="lesson-panel">
      <div className="lesson-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'mission'} className={tab === 'mission' ? 'selected' : ''} onClick={() => setTab('mission')}>Missão</button>
        <button type="button" role="tab" aria-selected={tab === 'article'} className={tab === 'article' ? 'selected' : ''} onClick={() => setTab('article')}>Apostila</button>
      </div>
      <div className="lesson-content">
        {tab === 'mission' ? <>
          <p className="lesson-idea">{lesson.idea}</p>
          <div className="guide-heading"><div><BookOpen size={14} /><strong>Passo a passo</strong></div><span>{stepDone.filter(Boolean).length} de {lesson.steps.length}</span></div>
          <div className="guide-progress" aria-label={`${stepDone.filter(Boolean).length} de ${lesson.steps.length} passos concluídos`}><span style={{ width: `${stepDone.filter(Boolean).length / lesson.steps.length * 100}%` }} /></div>
          <div className="guide-list">
            {lesson.steps.map((step, stepIndex) => {
              const completed = stepDone[stepIndex]
              const current = stepIndex === activeStep
              const locked = activeStep >= 0 && stepIndex > activeStep
              const verified = verifiedSteps.includes(step.id)
              return <section className={`guide-step ${completed ? 'completed' : ''} ${current ? 'current' : ''} ${locked ? 'locked' : ''}`} key={step.id}>
                <div className="guide-step-heading"><span className="guide-step-number">{completed ? <Check size={12} /> : stepIndex + 1}</span><div><small>{completed ? 'Concluído' : current ? 'Agora' : 'Depois'}</small><h3>{step.title}</h3></div></div>
                {current && <div className="guide-step-body">
                  <div className="learning-phase"><span>1</span> Entenda</div>
                  <p>{step.explanation}</p>
                  {step.command && <>
                    <div className="learning-phase"><span>2</span> Faça</div>
                    <div className="guided-command"><code>{step.command}</code><button type="button" aria-label={`Copiar comando do passo ${stepIndex + 1}`} onClick={() => void copyCommand(step.id, step.command!)}>{copiedStep === step.id ? <Check size={12} /> : <Copy size={12} />}</button></div>
                    {step.commandParts && <div className="command-parts">{step.commandParts.map((part) => <div key={part.text}><code>{part.text}</code><span>{part.meaning}</span></div>)}</div>}
                  </>}
                  {step.lookFor && <div className="look-for"><Eye size={14} /><div><strong>3 · O que observar</strong><span>{step.lookFor}</span></div></div>}
                  {verified ? <>
                    <div className="result-confirm" role="status"><CheckCircle2 size={16} /><div><strong>Evidência encontrada</strong><span>{step.takeaway ?? 'O resultado esperado apareceu. Relacione-o com a explicação antes de continuar.'}</span></div></div>
                    <button type="button" className="guide-action" onClick={() => acknowledge(step.id)}>Entendi o resultado <ChevronRight size={14} /></button>
                    {step.command && <button type="button" className="repeat-action" onClick={() => runStepCommand(step)}><RotateCcw size={12} /> Executar novamente</button>}
                  </> : step.applyEdit ? <button type="button" className="guide-action" onClick={() => applyStepEdit(step)}><PencilLine size={14} />{step.applyEdit.label}</button>
                    : step.command ? <button type="button" className="guide-action" onClick={() => runStepCommand(step)}><Play size={14} />Executar e observar</button>
                      : <button type="button" className="guide-action" onClick={() => acknowledge(step.id)}>Entendi, continuar <ChevronRight size={14} /></button>}
                  {step.command && !verified && <p className="type-yourself">Você também pode digitar o comando no terminal à esquerda.</p>}
                </div>}
              </section>
            })}
          </div>
          <h3 className="section-label proof-label">O que você comprovou</h3>
          <div className="objective-list compact">
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
