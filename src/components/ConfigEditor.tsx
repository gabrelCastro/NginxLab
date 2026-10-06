import { useRef } from 'react'
import { CircleAlert, FileCode2 } from 'lucide-react'
import { useLab } from '../store/useLab'
import { Panel } from './Panel'

export function ConfigEditor() {
  const source = useLab((state) => state.session.draftSource)
  const active = useLab((state) => state.session.activeSource)
  const errorLine = useLab((state) => state.errorLine)
  const setDraft = useLab((state) => state.setDraft)
  const run = useLab((state) => state.runCommand)
  const textarea = useRef<HTMLTextAreaElement>(null)
  const highlight = useRef<HTMLPreElement>(null)
  const gutter = useRef<HTMLDivElement>(null)
  const changed = source !== active
  const lines = source.split('\n')

  const onKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Tab') {
      event.preventDefault()
      const target = event.currentTarget
      const start = target.selectionStart
      const next = `${source.slice(0, start)}    ${source.slice(target.selectionEnd)}`
      setDraft(next)
      requestAnimationFrame(() => {
        target.selectionStart = start + 4
        target.selectionEnd = start + 4
      })
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault()
      run('nginx -t')
    }
  }

  return (
    <Panel title="nginx.conf" eyebrow="Configuração" className="editor-panel" actions={changed ? <span className="unsaved-dot">não recarregada</span> : <span className="active-dot">ativa</span>}>
      <div className="editor-toolbar"><FileCode2 size={13} /> /etc/nginx/nginx.conf <span>Ctrl + Enter testa</span></div>
      <div className="code-editor">
        <div ref={gutter} className="line-numbers" aria-hidden="true">
          {lines.map((_, index) => <span key={index} className={errorLine === index + 1 ? 'line-error' : ''}>{errorLine === index + 1 && <CircleAlert size={10} />}{index + 1}</span>)}
        </div>
        <div className="code-input-wrap">
          <pre ref={highlight} className="syntax-highlight" aria-hidden="true">{lines.map((line, index) => <span key={index}>{highlightLine(line)}{'\n'}</span>)}</pre>
          <textarea
            ref={textarea}
            aria-label="Editor do nginx.conf"
            value={source}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={onKeyDown}
            onScroll={(event) => {
              if (highlight.current) {
                highlight.current.scrollTop = event.currentTarget.scrollTop
                highlight.current.scrollLeft = event.currentTarget.scrollLeft
              }
              if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop
            }}
            spellCheck={false}
            wrap="off"
          />
        </div>
      </div>
      {errorLine && <div className="editor-error"><CircleAlert size={13} /> Erro apontado na linha {errorLine}</div>}
    </Panel>
  )
}

const syntax = /(#.*$|"[^"\n]*"|'[^'\n]*'|\b(?:events|http|server|location|listen|server_name|root|alias|index|try_files|return|rewrite|proxy_pass|proxy_set_header|upstream|add_header|limit_req|proxy_cache)\b|[{};])/g

function highlightLine(line: string) {
  return line.split(syntax).filter(Boolean).map((part, index) => {
    const className = part.startsWith('#') ? 'syntax-comment'
      : part.startsWith('"') || part.startsWith("'") ? 'syntax-string'
        : /^[{};]$/.test(part) ? 'syntax-punctuation'
          : syntax.test(part) ? 'syntax-directive'
            : ''
    syntax.lastIndex = 0
    return <span key={`${part}-${index}`} className={className}>{part}</span>
  })
}
