import { BadgeCheck, CircleAlert, Clock3 } from 'lucide-react'
import type { MissionVariant } from '../missions/catalog'
import { latestAttempt, useAttempts } from '../sync/attempts'
import { useSync } from '../sync/progressSync'

export function MissionVerification({ variant }: { variant: MissionVariant }) {
  const items = useAttempts((state) => state.items)
  const status = useSync((state) => state.snapshot.status)
  const attempt = latestAttempt(items, variant)
  if (status === 'disabled') return <p className="mission-verification">A verificação no servidor está desativada nesta instalação; esta conclusão vale só neste navegador.</p>
  if (!attempt) return null
  if (attempt.state === 'verified') return <p className="mission-verification verified" role="status"><BadgeCheck size={15} aria-hidden="true" /> Verificado pelo servidor: a configuração foi reexecutada e respondeu como esperado.</p>
  if (attempt.state === 'pending') return <p className="mission-verification" role="status"><Clock3 size={15} aria-hidden="true" /> Aguardando verificação do servidor. A solução será enviada assim que houver conexão.</p>
  return <p className="mission-verification refused" role="status"><CircleAlert size={15} aria-hidden="true" /> O servidor não confirmou esta solução{attempt.message ? `: ${attempt.message}` : '.'}</p>
}
