import { useEffect } from 'react'
import { Info, X } from 'lucide-react'
import { useLab } from '../store/useLab'

export function ExternalNotice() {
  const notice = useLab((state) => state.externalNotice)
  const dismiss = useLab((state) => state.dismissExternalNotice)

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(dismiss, 8_000)
    return () => clearTimeout(timer)
  }, [dismiss, notice])

  if (!notice) return null
  return <div className="external-notice" role="status">
    <Info size={14} aria-hidden="true" />
    <p>{notice}</p>
    <button type="button" onClick={dismiss} aria-label="Fechar aviso"><X size={14} /></button>
  </div>
}
