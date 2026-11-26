import { useState } from 'react'
import { X, User as UserIcon, Lock, Phone, Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react'
import { api, type User } from '../api'

type Props = {
  open: boolean
  onClose: () => void
  onSuccess: (user: User) => void
  isCheckoutTrigger?: boolean
}

export default function AuthModal({
  open,
  onClose,
  onSuccess,
  isCheckoutTrigger = false,
}: Props) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const resetForm = () => {
    setUsername('')
    setPhone('')
    setPassword('')
    setConfirmPassword('')
    setError('')
    setShowPassword(false)
  }

  const handleSwitchTab = (newTab: 'login' | 'register') => {
    setTab(newTab)
    setError('')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    const cleanUser = username.trim()
    const cleanPhone = phone.trim()

    if (tab === 'login') {
      if (!cleanUser || !password) {
        setError('Vui lòng nhập đầy đủ tên tài khoản và mật khẩu')
        return
      }

      setLoading(true)
      try {
        const res = await api.auth.login({ username: cleanUser, password })
        resetForm()
        onSuccess(res.user)
        onClose()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Đăng nhập không thành công. Vui lòng thử lại.')
      } finally {
        setLoading(false)
      }
    } else {
      if (!cleanUser) {
        setError('Vui lòng nhập tên tài khoản')
        return
      }
      if (!cleanPhone || cleanPhone.length < 9) {
        setError('Vui lòng nhập số điện thoại hợp lệ (tối thiểu 9 số)')
        return
      }
      if (!password || password.length < 6) {
        setError('Mật khẩu cần tối thiểu 6 ký tự để bảo mật tài khoản')
        return
      }
      if (password !== confirmPassword) {
        setError('Mật khẩu nhập lại không khớp')
        return
      }

      setLoading(true)
      try {
        const res = await api.auth.register({
          username: cleanUser,
          phone: cleanPhone,
          password,
        })
        resetForm()
        onSuccess(res.user)
        onClose()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Đăng ký không thành công. Vui lòng thử lại.')
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="auth-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="auth-modal-header">
          <div className="auth-brand-logo">
            <span className="logo-badge">C</span>
            <span>CloudPhone ID</span>
          </div>
          <button className="icon-btn-close" onClick={onClose} aria-label="Đóng cửa sổ">
            <X size={18} />
          </button>
        </div>

        {isCheckoutTrigger && (
          <div className="auth-checkout-prompt">
            <ShieldCheck size={16} />
            <span>Đăng nhập hoặc đăng ký nhanh để bảo lưu ưu đãi giảm giá đơn hàng của bạn!</span>
          </div>
        )}

        <div className="auth-tabs-row">
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'login' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('login')}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            className={`auth-tab-btn ${tab === 'register' ? 'active' : ''}`}
            onClick={() => handleSwitchTab('register')}
          >
            Đăng ký tài khoản
          </button>
        </div>

        {error && <div className="auth-error-banner">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field-group">
            <label htmlFor="authUsername">Tên tài khoản hoặc Email</label>
            <div className="auth-input-wrap">
              <UserIcon size={16} className="auth-field-icon" />
              <input
                id="authUsername"
                type="text"
                placeholder="Ví dụ: nguyenvana"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
              />
            </div>
          </div>

          {tab === 'register' && (
            <div className="auth-field-group">
              <label htmlFor="authPhone">Số điện thoại liên hệ</label>
              <div className="auth-input-wrap">
                <Phone size={16} className="auth-field-icon" />
                <input
                  id="authPhone"
                  type="tel"
                  placeholder="Ví dụ: 0912345678"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  autoComplete="tel"
                />
              </div>
            </div>
          )}

          <div className="auth-field-group">
            <label htmlFor="authPassword">Mật khẩu</label>
            <div className="auth-input-wrap">
              <Lock size={16} className="auth-field-icon" />
              <input
                id="authPassword"
                type={showPassword ? 'text' : 'password'}
                placeholder="Tối thiểu 6 ký tự"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
              />
              <button
                type="button"
                className="toggle-password-btn"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {tab === 'register' && (
            <div className="auth-field-group">
              <label htmlFor="authConfirmPassword">Xác nhận lại mật khẩu</label>
              <div className="auth-input-wrap">
                <Lock size={16} className="auth-field-icon" />
                <input
                  id="authConfirmPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Nhập lại đúng mật khẩu phía trên"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                />
              </div>
            </div>
          )}

          <button type="submit" className="btn-auth-submit" disabled={loading}>
            <span>{loading ? 'Đang xác thực...' : tab === 'login' ? 'Đăng nhập ngay' : 'Tạo tài khoản'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div className="auth-footer-help">
          <p>
            {tab === 'login' ? 'Chưa có tài khoản CloudPhone? ' : 'Đã có tài khoản? '}
            <button
              type="button"
              className="auth-switch-link"
              onClick={() => handleSwitchTab(tab === 'login' ? 'register' : 'login')}
            >
              {tab === 'login' ? 'Đăng ký miễn phí' : 'Đăng nhập ngay'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
