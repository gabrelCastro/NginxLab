import { useEffect, useRef, useState } from 'react'
import { TerminalSquare } from 'lucide-react'
import { useLab } from '../store/useLab'
import { Panel } from './Panel'

const commands = ['nginx -t', 'nginx -s reload', 'curl -i http://localhost/', 'cat /etc/nginx/nginx.conf', 'ls /', 'tail /var/log/nginx/access.log', 'tail /var/log/nginx/error.log', 'help', 'clear']

export function Terminal() {
  const entries = useLab((state) => state.terminalEntries)
  const history = useLab((state) => state.commandHistory)
  const run = useLab((state) => state.runCommand)
  const [value, setValue] = useState('')
  const [historyIndex, setHistoryIndex] = useState(0)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end' })
  }, [entries])
  useEffect(() => {
    const focus = () => input.current?.focus()
    window.addEventListener('nginxlearn:focus-terminal', focus)
    return () => window.removeEventListener('nginxlearn:focus-terminal', focus)
  }, [])

  const executeValue = () => {
    if (!value.trim()) return
    run(value)
    setValue('')
    setHistoryIndex(history.length + 1)
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    executeValue()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      executeValue()
    } else if (event.key === 'ArrowUp' && history.length) {
      event.preventDefault()
      const index = Math.max(0, (historyIndex || history.length) - 1)
      setHistoryIndex(index)
      setValue(history[index] ?? '')
    } else if (event.key === 'ArrowDown' && history.length) {
      event.preventDefault()
      const index = Math.min(history.length, historyIndex + 1)
      setHistoryIndex(index)
      setValue(history[index] ?? '')
    } else if (event.key === 'Tab') {
      event.preventDefault()
      const match = commands.find((command) => command.startsWith(value))
      if (match) setValue(match)
    }
  }

  return (
    <Panel title="Terminal" eyebrow="Shell simulado" className="terminal-panel" actions={<TerminalSquare size={15} className="text-accent" />}>
      <div className="terminal-output" onClick={() => input.current?.focus()} role="log" aria-live="polite">
        <p className="terminal-welcome">nginxlearn shell · nginx/1.27.5</p>
        {entries.map((entry) => <div key={entry.id} className="terminal-entry"><div><span className="prompt">aluno@lab:~$</span> {entry.command}</div>{entry.output && <pre>{entry.output}</pre>}</div>)}
        <form onSubmit={submit} className="terminal-form">
          <span className="prompt">aluno@lab:~$</span>
          <input ref={input} aria-label="Comando do terminal" value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={onKeyDown} autoComplete="off" spellCheck={false} />
        </form>
        <div ref={end} />
      </div>
    </Panel>
  )
}
