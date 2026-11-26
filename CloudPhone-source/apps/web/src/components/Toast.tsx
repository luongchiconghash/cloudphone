import { CheckCircle2, Info, X } from 'lucide-react'

export type ToastMessage = {
  id: string
  text: string
  type?: 'success' | 'info' | 'warning'
}

type Props = {
  toasts: ToastMessage[]
  onClose?: (id: string) => void
}

export default function Toast({ toasts, onClose }: Props) {
  if (!toasts.length) return null

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast-item ${t.type || 'info'}`}>
          {t.type === 'success' ? (
            <CheckCircle2 size={16} />
          ) : (
            <Info size={16} />
          )}
          <span>{t.text}</span>
          {onClose && (
            <button
              type="button"
              className="toast-close-btn"
              onClick={() => onClose(t.id)}
              aria-label="Đóng thông báo"
            >
              <X size={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
