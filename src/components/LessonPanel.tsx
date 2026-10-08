import { useEffect, useRef, useState } from 'react'
import { BookOpen, Check, CheckCircle2, ChevronRight, Circle, Copy, ExternalLink, Eye, Lightbulb, LockKeyhole, Monitor, PencilLine, Play, RotateCcw } from 'lucide-react'
import { lessons, type LessonStep } from '../lessons'
import { campaign } from '../lessons/campaign'
import { useLab } from '../store/useLab'
import { Panel } from './Panel'

export function LessonPanel() {
  const [tab, setTab] = useState<'mission' | 'article'>('mission')
  const [copiedStep, setCopiedStep] = useState<string>()
  const stepStart = useRef({ key: '', eventCount: 0 })
  const index = useLab((state) => state.lessonIndex)
  const lessonRunId = useLab((state) => state.lessonRunId)
  const events = useLab((state) => state.events)
  const guide = useLab((state) => state.guide)
  const updateGuide = useLab((state) => state.updateGuide)
  const storageAvailable = useLab((state) => state.storageAvailable)
  const response = useLab((state) => state.response)
  const source = useLab((state) => state.session.draftSource)
  const runCommand = useLab((state) => state.runCommand)
  const setDraft = useLab((state) => state.setDraft)
  const markLessonComplete = useLab((state) => state.markLessonComplete)
  const selectLesson = useLab((state) => state.selectLesson)
  const openMission = useLab((state) => state.openMission)
  const lesson = lessons[index]!
  const chapter = campaign[lesson.id]!
  const { hintCount, completedSteps, verifiedSteps, answers, recallAnswer } = guide
  const done = lesson.objectives.map((objective) => objective.verify(events))
  const stepDone = lesson.steps.map((step) => completedSteps.includes(step.id))
  const activeStep = stepDone.findIndex((value) => !value)
  const currentStep = activeStep >= 0 ? lesson.steps[activeStep] : undefined
  const guideComplete = activeStep === -1
  const recallComplete = !chapter.recall || recallAnswer === chapter.recall.correctIndex
  const complete = done.every(Boolean) && guideComplete && recallComplete

  useEffect(() => {
    setTab('mission')
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
      if (!verifiedSteps.includes(currentStep.id)) updateGuide({ verifiedSteps: [...verifiedSteps, currentStep.id] })
    }
  }, [currentStep, events, lesson.id, updateGuide, verifiedSteps])

  useEffect(() => {
    if (complete) markLessonComplete(lesson.id)
  }, [complete, lesson.id, markLessonComplete])

  const acknowledge = (id: string) => { if (!completedSteps.includes(id)) updateGuide({ completedSteps: [...completedSteps, id] }) }

  const applyStepEdit = (step: LessonStep) => {
    if (!step.applyEdit) return
    setDraft(source.replace(step.applyEdit.search, step.applyEdit.replace))
    if (!verifiedSteps.includes(step.id)) updateGuide({ verifiedSteps: [...verifiedSteps, step.id] })
  }

  const runStepCommand = (step: LessonStep) => {
    if (step.command) runCommand(step.command)
  }

  const answerCheck = (step: LessonStep, answer: number) => {
    if (!step.check) return
    updateGuide({ answers: { ...answers, [step.id]: answer }, ...(answer === step.check.correctIndex && !verifiedSteps.includes(step.id) ? { verifiedSteps: [...verifiedSteps, step.id] } : {}) })
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
          <div className="chapter-story"><span>Capítulo {lesson.number} de {lessons.length} · Verde & Co.</span><h3>{chapter.title}</h3><p>{chapter.situation}</p><p className="chapter-goal"><strong>Sua tarefa:</strong> {chapter.goal}</p></div>
          {!storageAvailable && <p className="chapter-recall-reminder" role="status">O navegador não permitiu salvar. Seu progresso continua nesta sessão.</p>}
          {chapter.recall && <div className="chapter-recall"><span>Antes de avançar · relembre</span><h3>{chapter.recall.prompt}</h3><div>{chapter.recall.options.map((option, optionIndex) => <button type="button" key={option} className={recallAnswer === optionIndex ? 'selected' : ''} onClick={() => updateGuide({ recallAnswer: optionIndex })}>{option}</button>)}</div>{recallAnswer !== null && <p role="status" className={recallComplete ? 'correct' : ''}>{chapter.recall.feedback[recallAnswer]}</p>}</div>}
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
                  {step.check && !verified && <div className="knowledge-check">
                    <div className="learning-phase"><span>2</span> Confira sua compreensão</div>
                    <strong>{step.check.prompt}</strong>
                    <div className="check-options">{step.check.options.map((option, optionIndex) => <button type="button" className={answers[step.id] === optionIndex ? 'selected wrong' : ''} key={option} onClick={() => answerCheck(step, optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div>
                    {answers[step.id] !== undefined && answers[step.id] !== step.check.correctIndex && <p className="check-feedback">Ainda não. Volte à explicação acima, reveja o conceito e tente novamente.</p>}
                  </div>}
                  {step.lookFor && <div className="look-for"><Eye size={14} /><div><strong>3 · O que observar</strong><span>{step.lookFor}</span></div></div>}
                  {verified ? <>
                    <div className="result-confirm" role="status"><CheckCircle2 size={16} /><div><strong>{step.check ? 'Compreensão confirmada' : 'Evidência encontrada'}</strong><span>{step.takeaway}</span></div></div>
                    <button type="button" className="guide-action" onClick={() => acknowledge(step.id)}>Entendi o resultado <ChevronRight size={14} /></button>
                    {step.command && <button type="button" className="repeat-action" onClick={() => runStepCommand(step)}><RotateCcw size={12} /> Executar novamente</button>}
                  </> : step.applyEdit ? <button type="button" className="guide-action" onClick={() => applyStepEdit(step)}><PencilLine size={14} />{step.applyEdit.label}</button>
                    : step.command ? <button type="button" className="guide-action" onClick={() => runStepCommand(step)}><Play size={14} />Executar e observar</button>
                      : !step.check && <button type="button" className="guide-action" onClick={() => acknowledge(step.id)}>Entendi, continuar <ChevronRight size={14} /></button>}
                  {step.command && !verified && <p className="type-yourself">Você também pode digitar o comando no terminal à esquerda.</p>}
                </div>}
              </section>
            })}
          </div>
          <h3 className="section-label proof-label">O que você comprovou</h3>
          <div className="objective-list compact">
            {lesson.objectives.map((objective, objectiveIndex) => <div className={done[objectiveIndex] ? 'objective done' : 'objective'} key={objective.id}>{done[objectiveIndex] ? <Check size={14} /> : <Circle size={14} />}<span>{objective.label}</span></div>)}
          </div>
          {guideComplete && done.every(Boolean) && !recallComplete && <p className="chapter-recall-reminder">Responda à pergunta “Antes de avançar” para fechar este capítulo.</p>}
          {complete && <div className="completion-card"><Check size={17} /><div><strong>Lição concluída</strong><span>{chapter.outcome}</span></div>{lesson.id === 'caminhos-e-arquivos' && <button type="button" onClick={openMission}>Missão da loja <ChevronRight size={14} /></button>}{index < lessons.length - 1 && <button type="button" onClick={() => selectLesson(index + 1)}>Próximo <ChevronRight size={14} /></button>}</div>}
          <div className="hint-area">
            <button type="button" className="hint-button" onClick={() => updateGuide({ hintCount: Math.min(lesson.hints.length, hintCount + 1) })}><Lightbulb size={14} /> Travou? {hintCount ? 'Outra dica' : 'Ver uma dica'}</button>
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
