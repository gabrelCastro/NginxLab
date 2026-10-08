import { useState, type FormEvent } from 'react'
import { LogIn, LogOut, UserPlus } from 'lucide-react'
import { useSync } from '../sync/progressSync'

type Mode = 'idle' | 'create' | 'signin' | 'signout'

function clearThisBrowser() {
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('nginxlearn:')) localStorage.removeItem(key)
  } catch { /* Nada a apagar. */ }
  window.location.reload()
}

export function AccountSection() {
  const email = useSync((state) => state.snapshot.email)
  const status = useSync((state) => state.snapshot.status)
  const createAccount = useSync((state) => state.createAccount)
  const signIn = useSync((state) => state.signIn)
  const signOut = useSync((state) => state.signOut)
  const [mode, setMode] = useState<Mode>('idle')
  const [form, setForm] = useState({ email: '', password: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  if (status === 'disabled') return null

  const open = (next: Mode) => { setMode(next); setError(undefined) }
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    const result = mode === 'create' ? await createAccount(form.email, form.password) : await signIn(form.email, form.password)
    setBusy(false)
    if (result.ok) { setMode('idle'); setForm({ email: '', password: '' }) } else setError(result.message)
  }
  const leave = async (clear: boolean) => {
    setBusy(true)
    await signOut()
    setBusy(false)
    setMode('idle')
    if (clear) clearThisBrowser()
  }

  return <section className="account-section" aria-label="Conta">
    {email ? <>
      <p><strong>Conta:</strong> {email}</p>
      {mode !== 'signout' ? <button type="button" onClick={() => open('signout')}><LogOut size={13} /> Sair neste navegador</button> : <div className="account-choices">
        <p>O servidor continua com o progresso da conta. E neste navegador?</p>
        <button type="button" disabled={busy} onClick={() => void leave(false)}>Sair e manter o progresso aqui</button>
        <button type="button" disabled={busy} onClick={() => void leave(true)}>Sair e apagar o progresso deste navegador</button>
        <button type="button" className="account-cancel" onClick={() => open('idle')}>Cancelar</button>
      </div>}
    </> : <>
      <p>Seu progresso está ligado a este navegador. Com uma conta, você o recupera em outro lugar.</p>
      {mode === 'idle' && <div className="account-choices inline">
        <button type="button" onClick={() => open('create')}><UserPlus size={13} /> Criar conta</button>
        <button type="button" onClick={() => open('signin')}><LogIn size={13} /> Entrar</button>
      </div>}
      {(mode === 'create' || mode === 'signin') && <form className="account-form" onSubmit={(event) => void submit(event)}>
        <label>E-mail<input type="email" required maxLength={254} autoComplete="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
        <label>Senha<input type="password" required minLength={mode === 'create' ? 10 : 1} maxLength={72} autoComplete={mode === 'create' ? 'new-password' : 'current-password'} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
        <small>{mode === 'create' ? 'Mínimo de 10 caracteres. O progresso atual passa a pertencer à conta.' : 'O progresso deste navegador é combinado com o da conta. Versões diferentes do mesmo capítulo aparecem para você escolher.'}</small>
        {error && <p className="account-error" role="alert">{error}</p>}
        <div className="account-choices inline">
          <button type="submit" disabled={busy}>{busy ? 'Aguarde…' : mode === 'create' ? 'Criar conta' : 'Entrar'}</button>
          <button type="button" className="account-cancel" onClick={() => open('idle')}>Cancelar</button>
        </div>
      </form>}
    </>}
  </section>
}
