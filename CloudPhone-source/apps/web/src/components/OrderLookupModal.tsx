import { useEffect, useState } from 'react'
import {
  Search,
  Package,
  Clock,
  Truck,
  CheckCircle2,
  Copy,
  Check,
  Sparkles,
  X,
  MapPin,
  Calendar,
} from 'lucide-react'
import { api, vnd, type Order } from '../api'
import { trackStoreEvent } from '../utils/streamTracker'
import { showProductPlaceholder } from '../utils/productImage'

type Props = {
  onClose: () => void
  onAskAI?: (prompt: string) => void
}

export default function OrderLookupModal({ onClose, onAskAI }: Props) {
  const [orderCode, setOrderCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [order, setOrder] = useState<Order | null>(null)
  const [ordersList, setOrdersList] = useState<Order[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    api.orders.lookup().then((result) => {
      if (!active) return
      setOrdersList(result.orders)
      setOrder(result.order ?? null)
    }).catch((err: Error) => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  const handleLookup = async () => {
    const code = orderCode.trim()
    setLoading(true)
    setError('')
    if (code) trackStoreEvent('order_lookup')
    try {
      const result = await api.orders.lookup(code || undefined)
      setOrdersList(result.orders)
      setOrder(result.order ?? null)
      if (!result.order) setError(code ? 'Không tìm thấy mã đơn trong tài khoản.' : 'Bạn chưa có đơn hàng.')
    } catch (err: unknown) {
      setOrdersList([])
      setOrder(null)
      setError(err instanceof Error ? err.message : 'Không thể tra cứu đơn hàng.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const renderStatusBadge = (status: string) => {
    const s = status.toLowerCase()
    if (s.includes('hủy')) {
      return (
        <span className="order-status-badge cancelled">
          <X size={13} />
          <span>Đã hủy đơn</span>
        </span>
      )
    }
    if (s.includes('hoàn tất') || s.includes('thành công')) {
      return (
        <span className="order-status-badge success">
          <CheckCircle2 size={13} />
          <span>Giao thành công</span>
        </span>
      )
    }
    if (s.includes('đang giao') || s.includes('vận chuyển')) {
      return (
        <span className="order-status-badge shipping">
          <Truck size={13} />
          <span>Đang giao hàng</span>
        </span>
      )
    }
    if (s.includes('xác nhận')) {
      return (
        <span className="order-status-badge confirmed">
          <Check size={13} />
          <span>Đã xác nhận</span>
        </span>
      )
    }
    return (
      <span className="order-status-badge pending">
        <Clock size={13} />
        <span>Đã tiếp nhận đơn</span>
      </span>
    )
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="order-lookup-card" onClick={(e) => e.stopPropagation()}>
        <div className="order-lookup-header">
          <div className="header-title-box">
            <span className="badge-pill">Trung tâm vận đơn</span>
            <h2>Đơn hàng của tôi</h2>
          </div>
          <button className="icon-btn-close" onClick={onClose} aria-label="Đóng tra cứu">
            <X size={20} />
          </button>
        </div>

        {/* SEARCH FORM */}
        <form
          className="order-search-form"
          onSubmit={(e) => {
            e.preventDefault()
            handleLookup()
          }}
        >
          <div className="search-inputs-grid">
            <div className="input-group">
              <label htmlFor="lookupOrderCode">Mã đơn hàng</label>
              <div className="input-with-icon">
                <Package size={16} />
                <input
                  id="lookupOrderCode"
                  type="text"
                  placeholder="Nhập mã đơn hoặc để trống để xem tất cả"
                  value={orderCode}
                  onChange={(e) => setOrderCode(e.target.value)}
                />
              </div>
            </div>

          </div>

          <div className="lookup-actions-row">
            <button type="submit" className="btn-lookup-submit" disabled={loading}>
              <Search size={16} />
              <span>{loading ? 'Đang tra cứu...' : 'Tra cứu hành trình đơn'}</span>
            </button>
          </div>
        </form>

        {error && <div className="lookup-error-banner" role="alert">{error}</div>}
        {!loading && !error && !order && <p>Bạn chưa có đơn hàng.</p>}

        {/* ORDERS LIST TABS IF MULTIPLE */}
        {ordersList.length > 1 && (
          <div className="multiple-orders-tabs">
            <span className="tabs-title">Tìm thấy {ordersList.length} đơn hàng:</span>
            <div className="tabs-list">
              {ordersList.map((ord) => (
                <button
                  key={ord.order_code}
                  type="button"
                  className={`order-tab-chip ${order?.order_code === ord.order_code ? 'active' : ''}`}
                  onClick={() => setOrder(ord)}
                >
                  <strong>{ord.order_code}</strong> • {vnd(ord.total_amount)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ORDER DETAILS & LOGISTICS TRACKING STEPPER */}
        {order && (
          <div className="order-result-box">
            <div className="order-result-top">
              <div className="code-and-status">
                <span className="order-number">Mã đơn hàng: <strong>{order.order_code}</strong></span>
                <button
                  type="button"
                  className="btn-copy-code-mini"
                  onClick={() => handleCopyCode(order.order_code)}
                  title="Sao chép mã"
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
                {renderStatusBadge(order.status)}
              </div>

              {order.created_at && (
                <div className="order-time">
                  <Calendar size={13} />
                  <span>Ngày đặt: {new Date(order.created_at.replace(' ', 'T') + (order.created_at.includes('T') ? '' : 'Z')).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</span>
                </div>
              )}
            </div>

            {/* 4-STEP LOGISTICS TIMELINE */}
            {order.status.toLowerCase().includes('hủy') ? (
              <div className="lookup-error-banner" role="status">
                Đơn hàng này đã bị hủy. Tồn kho sản phẩm đã được hoàn lại.
              </div>
            ) : (() => {
              const s = order.status.toLowerCase()
              const step = s.includes('thành công') || s.includes('hoàn tất') ? 4
                : s.includes('đang giao') || s.includes('vận chuyển') ? 3
                : s.includes('xác nhận') ? 2 : 1
              return (
                <div className="logistics-stepper">
                  <div className="step-item completed">
                    <div className="step-dot">
                      <Check size={12} />
                    </div>
                    <div className="step-label">
                      <strong>Đã đặt hàng</strong>
                      <span>Hệ thống tiếp nhận</span>
                    </div>
                  </div>

                  <div className={`step-line ${step >= 2 ? 'active' : ''}`} />

                  <div className={`step-item ${step >= 2 ? 'completed' : 'current'}`}>
                    <div className="step-dot">
                      <Check size={12} />
                    </div>
                    <div className="step-label">
                      <strong>Xác nhận đơn</strong>
                      <span>Kho đã xuất bill</span>
                    </div>
                  </div>

                  <div className={`step-line ${step >= 3 ? 'active' : ''}`} />

                  <div className={`step-item ${step >= 3 ? 'completed' : step === 2 ? 'current' : ''}`}>
                    <div className="step-dot">
                      <Truck size={12} />
                    </div>
                    <div className="step-label">
                      <strong>Đang vận chuyển</strong>
                      <span>Hỏa tốc bưu tá</span>
                    </div>
                  </div>

                  <div className={`step-line ${step >= 4 ? 'active' : ''}`} />

                  <div className={`step-item ${step >= 4 ? 'completed' : step === 3 ? 'current' : ''}`}>
                    <div className="step-dot">
                      <CheckCircle2 size={12} />
                    </div>
                    <div className="step-label">
                      <strong>Giao thành công</strong>
                      <span>Kích hoạt bảo hành</span>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* RECIPIENT & DESTINATION INFO */}
            <div className="order-recipient-card">
              <div className="rec-info-col">
                <span className="rec-title">Người nhận hàng:</span>
                <strong>{order.customer_name}</strong>
                <span>📞 {order.phone}</span>
              </div>
              <div className="rec-info-col">
                <span className="rec-title">Địa chỉ nhận hàng:</span>
                <div className="rec-address">
                  <MapPin size={14} />
                  <span>{order.address}, {order.city}</span>
                </div>
                <span className="pay-method">Phương thức: {order.payment_method}</span>
              </div>
            </div>

            {/* ORDER ITEMS LIST */}
            <div className="order-items-wrapper">
              <span className="items-heading">Sản phẩm trong kiện hàng ({order.items.length}):</span>
              <div className="items-list">
                {order.items.map((item, idx) => (
                  <div key={idx} className="item-row">
                    {item.image ? (
                      <img src={item.image} alt={item.name} className="item-thumb" onError={showProductPlaceholder} />
                    ) : (
                      <div className="item-thumb-placeholder">
                        <Package size={18} />
                      </div>
                    )}
                    <div className="item-meta">
                      <span className="item-name">{item.name}</span>
                      <span className="item-qty-price">
                        Số lượng: <strong>{item.qty}</strong> • Đơn giá: {vnd(item.price)}
                      </span>
                    </div>
                    <span className="item-total">{vnd(item.price * item.qty)}</span>
                  </div>
                ))}
              </div>
              <div className="order-grand-total">
                <span>Tổng giá trị đơn hàng:</span>
                <span className="grand-price">{vnd(order.total_amount)}</span>
              </div>
            </div>

            {order.note && <p>Ghi chú giao hàng: {order.note}</p>}
            <p>Thanh toán: <strong>{order.payment_status}</strong></p>
            {order.qr_url && <p><a href={order.qr_url} target="_blank" rel="noreferrer">Mở mã VietQR của đơn</a></p>}

            {/* ASK AI BUTTON FOR THIS ORDER */}
            {onAskAI && (
              <div className="order-ai-support-row">
                <button
                  type="button"
                  className="btn-ask-ai-order"
                  onClick={() => {
                    onAskAI(`Tôi muốn hỗ trợ về tình trạng đơn hàng ${order.order_code}`)
                    onClose()
                  }}
                >
                  <Sparkles size={15} />
                  <span>Nhờ BIX AI kiểm tra hỗ trợ giao đơn này</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
