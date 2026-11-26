import { useState } from 'react'
import confetti from 'canvas-confetti'
import {
  X,
  CheckCircle2,
  Truck,
  QrCode,
  Copy,
  Check,
  ShieldCheck,
  Phone,
  User as UserIcon,
  MapPin,
  FileText,
} from 'lucide-react'
import { api, vnd, type Cart, type CheckoutOptions, type Order, type User } from '../api'

type Props = {
  cart: Cart
  user: User
  options: CheckoutOptions
  onClose: () => void
  onSuccess: () => void
}

export default function CheckoutModal({ cart, user, options, onClose, onSuccess }: Props) {
  const [fullname, setFullname] = useState(user?.username || '')
  const [phone, setPhone] = useState(user?.phone || '')
  const [city, setCity] = useState('Hà Nội')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'cod' | 'qr'>('cod')
  const [order, setOrder] = useState<Order | null>(null)
  const [requestId] = useState(() => crypto.randomUUID())
  const [qrFailed, setQrFailed] = useState(false)
  const orderCode = order?.order_code
  const discount = options.coupon_code === 'CLOUDPHONE500' ? 500_000 : options.coupon_code === 'VIPMEMBER' ? 200_000 : 0
  const care = options.vip_care ? 490_000 : 0
  const total = Math.max(0, cart.total + care - discount)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)

  const close = () => { if (!isSubmitting) onClose() }

  const handleCopyCode = () => {
    if (!orderCode) return
    navigator.clipboard.writeText(orderCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const triggerConfetti = () => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2563eb', '#10b981', '#f59e0b', '#6366f1'],
      })
    } catch {}
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (isSubmitting || cart.items.length === 0) return
    if (!fullname.trim()) {
      setError('Vui lòng nhập họ và tên người nhận')
      return
    }
    const cleanPhone = phone.trim()
    if (!cleanPhone || cleanPhone.length < 9) {
      setError('Vui lòng nhập số điện thoại hợp lệ (tối thiểu 9 số)')
      return
    }
    if (!address.trim()) {
      setError('Vui lòng nhập địa chỉ nhận hàng cụ thể')
      return
    }

    try {
      setIsSubmitting(true)
      setError('')
      const result = await api.orders.create({
        ...options,
        request_id: requestId,
        phone: cleanPhone,
        customer_name: fullname.trim(),
        address: address.trim(),
        city,
        note: note.trim(),
        payment_method: paymentMethod,
        expected_total: total,
        expected_items: cart.items.map(({ variant_id, qty }) => ({ variant_id, qty })),
      })
      setOrder(result.order)
      setError('')
      triggerConfetti()
      onSuccess()
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : 'Có lỗi xảy ra khi tạo đơn hàng. Vui lòng thử lại.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={close} role="dialog" aria-modal="true">
      <div className="checkout-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="checkout-modal-header">
          <div className="header-title-box">
            <span className="badge-pill">Thanh toán an toàn</span>
            <h2>{orderCode ? 'Đặt hàng thành công!' : 'Xác nhận thông tin giao hàng'}</h2>
          </div>
          <button className="icon-btn-close" onClick={close} aria-label="Đóng">
            <X size={20} />
          </button>
        </div>

        {orderCode ? (
          /* SUCCESS VIEW */
          <div className="checkout-success-view">
            <div className="success-icon-badge">
              <CheckCircle2 size={48} className="success-check-icon" />
            </div>

            <h3>Cảm ơn quý khách {fullname}!</h3>
            <p className="success-desc">
              Đơn hàng của quý khách đã được tiếp nhận thành công vào hệ thống điều phối CloudPhone.
            </p>

            <div className="order-code-box">
              <span className="code-label">Mã đơn hàng của bạn:</span>
              <div className="code-value-row">
                <span className="order-code-text">{orderCode}</span>
                <button
                  type="button"
                  className="btn-copy-code"
                  onClick={handleCopyCode}
                  title="Sao chép mã đơn"
                >
                  {copied ? <Check size={16} /> : <Copy size={16} />}
                  <span>{copied ? 'Đã sao chép' : 'Sao chép'}</span>
                </button>
              </div>
            </div>

            <p><strong>{order?.payment_status}</strong> · {vnd(order?.total_amount ?? 0)}</p>
            {order?.qr_url && (
              <div className="vietqr-box">
                <h4>Mã VietQR của đơn hàng</h4>
                {qrFailed ? <p role="alert">Không tải được mã. Có thể mở lại trong Đơn hàng của tôi.</p> : (
                  <div className="qr-wrapper">
                    <img src={order.qr_url} alt="Mã VietQR thanh toán đơn hàng"
                      className="qr-image" onError={() => setQrFailed(true)} />
                  </div>
                )}
                <p className="qr-note">Nội dung chuyển khoản: <strong>{orderCode}</strong></p>
              </div>
            )}

            <button type="button" className="btn-close-success" onClick={close}>
              Tiếp tục mua sắm
            </button>
          </div>
        ) : (
          /* CHECKOUT FORM VIEW */
          <form className="checkout-form" onSubmit={handleSubmit}>
            {error && <div className="checkout-error-banner">{error}</div>}

            <div className="checkout-form-grid">
              <div className="form-left-col">
                <div className="form-field-group">
                  <label htmlFor="fullname">
                    <UserIcon size={14} /> Họ và tên người nhận *
                  </label>
                  <input
                    id="fullname"
                    type="text"
                    required
                    placeholder="Ví dụ: Nguyễn Văn A"
                    value={fullname}
                    onChange={(e) => setFullname(e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label htmlFor="phone">
                    <Phone size={14} /> Số điện thoại nhận hàng *
                  </label>
                  <input
                    id="phone"
                    type="tel"
                    required
                    placeholder="Ví dụ: 0912345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label htmlFor="city">
                    <MapPin size={14} /> Tỉnh / Thành phố
                  </label>
                  <select id="city" value={city} onChange={(e) => setCity(e.target.value)}>
                    <option value="Hà Nội">Hà Nội (Hỏa tốc 1h)</option>
                    <option value="TP. Hồ Chí Minh">TP. Hồ Chí Minh (Hỏa tốc 1h)</option>
                    <option value="Đà Nẵng">Đà Nẵng (Giao trong ngày)</option>
                    <option value="Hải Phòng">Hải Phòng</option>
                    <option value="Cần Thơ">Cần Thơ</option>
                    <option value="Khác">Tỉnh thành khác (Giao 1-2 ngày)</option>
                  </select>
                </div>

                <div className="form-field-group">
                  <label htmlFor="address">
                    <MapPin size={14} /> Địa chỉ nhận hàng chi tiết *
                  </label>
                  <input
                    id="address"
                    type="text"
                    required
                    placeholder="Số nhà, tên đường, phường/xã..."
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>

                <div className="form-field-group">
                  <label htmlFor="note">
                    <FileText size={14} /> Ghi chú giao hàng (Tùy chọn)
                  </label>
                  <input
                    id="note"
                    type="text"
                    placeholder="Ví dụ: Giao giờ hành chính, gọi trước khi đến..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>
              </div>

              {/* PAYMENT METHODS */}
              <div className="form-right-col">
                <span className="section-label">Phương thức thanh toán:</span>
                <div className="payment-options-list">
                  <label
                    className={`payment-option-card ${paymentMethod === 'cod' ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="cod"
                      checked={paymentMethod === 'cod'}
                      onChange={() => setPaymentMethod('cod')}
                    />
                    <div className="option-icon-wrap">
                      <Truck size={18} />
                    </div>
                    <div className="option-info">
                      <strong>Thanh toán khi nhận hàng (COD)</strong>
                      <p>Kiểm tra máy rồi mới thanh toán cho bưu tá.</p>
                    </div>
                  </label>

                  {cart.qr_available && total > 0 && (
                  <label
                    className={`payment-option-card ${paymentMethod === 'qr' ? 'selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="qr"
                      checked={paymentMethod === 'qr'}
                      onChange={() => setPaymentMethod('qr')}
                    />
                    <div className="option-icon-wrap">
                      <QrCode size={18} />
                    </div>
                    <div className="option-info">
                      <strong>Chuyển khoản VietQR 24/7</strong>
                      <p>Quét mã ngân hàng tự động điền tiền và nội dung.</p>
                    </div>
                  </label>
                  )}
                </div>

                {/* ORDER SUMMARY PREVIEW */}
                <div className="checkout-summary-box">
                  <div className="summary-title-row">
                    <span>Đơn hàng ({cart.count} máy)</span>
                    <strong className="summary-total">{vnd(total)}</strong>
                  </div>
                  <div className="summary-items-mini">
                    {cart.items.map(({ product: p, qty, variant_id }) => (
                      <div key={variant_id} className="summary-mini-item">
                        <span>
                          {p.name} × {qty}
                        </span>
                        <span>{vnd(p.price * qty)}</span>
                      </div>
                    ))}
                    {care > 0 && <p>CloudPhone Care+ · +{vnd(care)}</p>}
                    {discount > 0 && <p>Giảm giá · −{vnd(discount)}</p>}
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-submit-order"
                  disabled={isSubmitting || cart.items.length === 0}
                >
                  {isSubmitting ? (
                    'Đang xử lý đơn hàng...'
                  ) : (
                    <>
                      <ShieldCheck size={18} />
                      <span>Xác nhận đặt hàng ngay</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
