import { useState } from 'react'
import {
  X,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  Tag,
  ShieldCheck,
  Truck,
  ArrowRight,
  Check,
} from 'lucide-react'
import { vnd, type Cart, type CheckoutOptions, type User } from '../api'
import { showProductPlaceholder } from '../utils/productImage'

type Props = {
  open: boolean
  cart: Cart
  busy: boolean
  user?: User | null
  onClose: () => void
  onUpdateQty: (variantId: string, qty: number) => void
  onClearCart: () => void
  onCheckoutSuccess: (options: CheckoutOptions) => void
}

const FREESHIP_THRESHOLD = 5000000 // 5 triệu freeship hỏa tốc
const VIP_CARE_PRICE = 490000 // Bảo hành VIP 1 đổi 1 trong 12 tháng

export default function CartDrawer({
  open,
  cart,
  busy,
  user,
  onClose,
  onUpdateQty,
  onClearCart,
  onCheckoutSuccess,
}: Props) {
  const [couponCode, setCouponCode] = useState('')
  const [discount, setDiscount] = useState(0)
  const [couponMessage, setCouponMessage] = useState<{ text: string; isError: boolean } | null>(null)
  const [hasVipCare, setHasVipCare] = useState(false)

  if (!open) return null

  const handleApplyCoupon = (codeOverride?: string) => {
    const code = (codeOverride || couponCode).trim().toUpperCase()
    if (!code) return

    if (code === 'CLOUDPHONE500') {
      setDiscount(500000)
      setCouponMessage({ text: 'Áp dụng thành công mã CLOUDPHONE500 (-500.000đ)', isError: false })
      setCouponCode('CLOUDPHONE500')
    } else if (code === 'VIPMEMBER') {
      setDiscount(200000)
      setCouponMessage({ text: 'Áp dụng mã VIPMEMBER (-200.000đ)', isError: false })
      setCouponCode('VIPMEMBER')
    } else {
      setDiscount(0)
      setCouponMessage({ text: 'Mã giảm giá không hợp lệ. Thử: CLOUDPHONE500', isError: true })
    }
  }

  // Progress for freeship meter
  const freeshipProgress = Math.min(100, Math.round((cart.total / FREESHIP_THRESHOLD) * 100))
  const remainingForFreeship = Math.max(0, FREESHIP_THRESHOLD - cart.total)

  // Total calculation
  const vipCareAmount = hasVipCare ? VIP_CARE_PRICE : 0
  const finalTotal = Math.max(0, cart.total - discount + vipCareAmount)

  return (
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="cart-drawer" onClick={(e) => e.stopPropagation()} aria-label="Giỏ hàng">
        {/* DRAWER HEADER */}
        <div className="drawer-header">
          <div className="drawer-title">
            <ShoppingBag size={20} className="drawer-header-icon" />
            <span>Giỏ hàng của bạn ({cart.count})</span>
          </div>
          <button className="icon-btn-close" onClick={onClose} aria-label="Đóng giỏ hàng">
            <X size={20} />
          </button>
        </div>

        {/* FREESHIP PROGRESS METER */}
        {cart.items.length > 0 && (
          <div className="freeship-meter-card">
            <div className="meter-label-row">
              <div className="meter-icon-text">
                <Truck size={15} />
                {remainingForFreeship > 0 ? (
                  <span>
                    Mua thêm <strong>{vnd(remainingForFreeship)}</strong> để nhận <strong>Freeship Hỏa Tốc</strong>
                  </span>
                ) : (
                  <span className="freeship-qualified">
                    <Check size={14} /> Bạn đã đủ điều kiện <strong>Freeship Hỏa Tốc toàn quốc!</strong>
                  </span>
                )}
              </div>
              <span className="meter-percent">{freeshipProgress}%</span>
            </div>
            <div className="meter-progress-track">
              <div
                className="meter-progress-fill"
                style={{ width: `${freeshipProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* DRAWER BODY */}
        <div className="drawer-body">
          {cart.items.length === 0 ? (
            <div className="empty-cart-view">
              <div className="empty-cart-icon-wrap">
                <ShoppingBag size={48} strokeWidth={1.5} />
              </div>
              <h3>Giỏ hàng đang trống</h3>
              <p>Khám phá bộ sưu tập smartphone cao cấp và nhận các khuyến mãi độc quyền từ CloudPhone!</p>
              <button type="button" className="btn-explore-now" onClick={onClose}>
                Khám phá máy ngay
              </button>
            </div>
          ) : (
            <div className="cart-items-container">
              {cart.items.map(({ product: p, qty, variant_id }) => (
                <div className="cart-item-row" key={variant_id}>
                  <img
                    src={p.image}
                    alt={p.name}
                    className="cart-item-thumb"
                    onError={showProductPlaceholder}
                  />

                  <div className="cart-item-details">
                    <span className="item-brand-tag">{p.brand}</span>
                    <h4 className="item-name">{p.name}</h4>
                    <span className="item-unit-price">{vnd(p.price)}</span>

                    <div className="item-bottom-controls">
                      <div className="qty-stepper">
                        <button
                          type="button"
                          className="qty-step-btn"
                          onClick={() => onUpdateQty(variant_id, qty - 1)}
                          disabled={busy}
                          aria-label="Giảm số lượng"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="qty-value">{qty}</span>
                        <button
                          type="button"
                          className="qty-step-btn"
                          onClick={() => onUpdateQty(variant_id, qty + 1)}
                          disabled={busy}
                          aria-label="Tăng số lượng"
                        >
                          <Plus size={13} />
                        </button>
                      </div>

                      <button
                        type="button"
                        className="btn-remove-item"
                        onClick={() => onUpdateQty(variant_id, 0)}
                        disabled={busy}
                        title={`Xóa ${p.name}`}
                        aria-label={`Xóa ${p.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* VIP CARE SERVICE TOGGLE */}
              <div
                className={`vip-care-addon-card ${hasVipCare ? 'selected' : ''}`}
                onClick={() => setHasVipCare(!hasVipCare)}
              >
                <div className="vip-care-checkbox">
                  <input
                    type="checkbox"
                    checked={hasVipCare}
                    onChange={(e) => setHasVipCare(e.target.checked)}
                    id="vipCareToggle"
                  />
                </div>
                <div className="vip-care-info">
                  <div className="vip-care-title-row">
                    <ShieldCheck size={16} className="vip-shield-icon" />
                    <strong>Gói Bảo Hành Vàng CloudPhone Care+ (1 đổi 1 12T)</strong>
                  </div>
                  <p>Bảo hành rơi vỡ, vào nước và đổi máy mới 100% không cần chờ thẩm định.</p>
                </div>
                <span className="vip-care-price">+{vnd(VIP_CARE_PRICE)}</span>
              </div>

              {/* COUPON INPUT & QUICK CHIPS */}
              <div className="cart-coupon-box">
                <div className="coupon-input-wrap">
                  <Tag size={16} className="coupon-icon" />
                  <input
                    type="text"
                    placeholder="Mã giảm giá (Nhập CLOUDPHONE500)"
                    value={couponCode}
                    onChange={(e) => { setCouponCode(e.target.value); setDiscount(0); setCouponMessage(null) }}
                  />
                  <button
                    type="button"
                    className="btn-apply-coupon"
                    onClick={() => handleApplyCoupon()}
                  >
                    Áp dụng
                  </button>
                </div>

                <div className="quick-coupon-chips">
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => handleApplyCoupon('CLOUDPHONE500')}
                  >
                    Mã <strong>CLOUDPHONE500</strong> (-500k)
                  </button>
                  <button
                    type="button"
                    className="chip-btn"
                    onClick={() => handleApplyCoupon('VIPMEMBER')}
                  >
                    Mã <strong>VIPMEMBER</strong> (-200k)
                  </button>
                </div>

                {couponMessage && (
                  <div className={`coupon-feedback ${couponMessage.isError ? 'error' : 'success'}`}>
                    {couponMessage.text}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* DRAWER FOOTER: SUMMARY & CTA */}
        {cart.items.length > 0 && (
          <div className="drawer-footer">
            <div className="price-breakdown-panel">
              <div className="breakdown-row">
                <span>Tạm tính ({cart.count} sản phẩm)</span>
                <strong>{vnd(cart.total)}</strong>
              </div>

              {hasVipCare && (
                <div className="breakdown-row highlight-addon">
                  <span>Gói CloudPhone Care+ (1 đổi 1)</span>
                  <span>+{vnd(VIP_CARE_PRICE)}</span>
                </div>
              )}

              {discount > 0 && (
                <div className="breakdown-row discount-row">
                  <span>Khuyến mãi Voucher</span>
                  <span>-{vnd(discount)}</span>
                </div>
              )}

              <div className="breakdown-row">
                <span>Vận chuyển</span>
                <span className="free-tag">Miễn phí</span>
              </div>

              <div className="breakdown-row total-row">
                <span>Tổng cộng thanh toán</span>
                <span className="final-price">{vnd(finalTotal)}</span>
              </div>
            </div>

            <div className="drawer-footer-actions">
              <button
                type="button"
                className="btn-checkout-primary"
                onClick={() => onCheckoutSuccess({ coupon_code: discount ? couponCode : undefined, vip_care: hasVipCare })}
                disabled={busy}
              >
                <span>Tiến hành đặt hàng</span>
                <ArrowRight size={17} />
              </button>
              <button
                type="button"
                className="btn-clear-cart-text"
                onClick={onClearCart}
                disabled={busy}
              >
                Xóa sạch giỏ hàng
              </button>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
