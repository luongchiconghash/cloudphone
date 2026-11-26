import { useState, useEffect } from 'react'
import {
  X,
  Star,
  Check,
  ShieldCheck,
  Truck,
  RotateCcw,
  CreditCard,
  Sparkles,
  ShoppingCart,
  Cpu,
  Battery,
  Camera,
  RefreshCw,
} from 'lucide-react'
import { api, vnd, type Product, type Variant } from '../api'
import { showProductPlaceholder } from '../utils/productImage'

type Props = {
  product: Product | null
  onClose: () => void
  onAddToCart: (product: Product, variantId?: string) => Promise<boolean>
  onAskAI?: (product: Product) => void
}

export default function ProductModal({ product, onClose, onAddToCart, onAskAI }: Props) {
  const [variants, setVariants] = useState<Variant[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [variantError, setVariantError] = useState('')
  const [isAdded, setIsAdded] = useState(false)
  const [adding, setAdding] = useState(false)

  const productId = product?.id
  useEffect(() => {
    if (!productId) return
    let active = true
    api.variants(productId).then((list) => {
      if (!active) return
      setVariants(list)
      setSelectedId(list[0]?.variant_id || '')
    }).catch((error: Error) => { if (active) setVariantError(error.message) })
    return () => { active = false }
  }, [productId])

  if (!product) return null
  const selected = variants.find((v) => v.variant_id === selectedId)
  const currentPrice = selected?.price ?? product.price
  const currentOldPrice = selected ? selected.original_price : product.original_price

  const discountPercent =
    currentOldPrice && currentOldPrice > currentPrice
      ? Math.round(((currentOldPrice - currentPrice) / currentOldPrice) * 100)
      : null

  const monthlyInstallment = Math.round(currentPrice / 12)

  const handleAdd = async () => {
    if (!selected || adding || isAdded) return
    setAdding(true)
    try {
      if (await onAddToCart(product, selected.variant_id)) {
        setIsAdded(true)
      }
    } finally {
      setAdding(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="product-modal-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-corner" onClick={onClose} aria-label="Đóng cửa sổ">
          <X size={20} />
        </button>

        <div className="product-modal-grid">
          {/* LEFT: GALLERY & DEVICE VIEW */}
          <div className="product-modal-visual">
            {product.tag && <span className="modal-badge-tag">{product.tag}</span>}
            <div className="modal-main-img-box">
              <img
                key={product.image}
                src={product.image}
                alt={product.name}
                className="modal-phone-img"
                onError={showProductPlaceholder}
              />
            </div>

            {/* TRUST SIGNALS */}
            <div className="modal-trust-card">
              <div className="trust-item">
                <Truck size={16} className="trust-icon" />
                <div>
                  <strong>Giao hỏa tốc 1 giờ</strong>
                  <p>Miễn phí vận chuyển nội thành</p>
                </div>
              </div>
              <div className="trust-item">
                <RotateCcw size={16} className="trust-icon" />
                <div>
                  <strong>1 đổi 1 trong 30 ngày</strong>
                  <p>Nếu phát sinh lỗi từ nhà sản xuất</p>
                </div>
              </div>
              <div className="trust-item">
                <ShieldCheck size={16} className="trust-icon" />
                <div>
                  <strong>Bảo hành chính hãng 12-24T</strong>
                  <p>Hỗ trợ kỹ thuật phần mềm trọn đời</p>
                </div>
              </div>
              <div className="trust-item">
                <CreditCard size={16} className="trust-icon" />
                <div>
                  <strong>Phương thức thanh toán</strong>
                  <p>Thanh toán khi nhận hàng (COD)</p>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: DETAILS, SPECS, CTA */}
          <div className="product-modal-content">
            <div className="modal-header-meta">
              <span className="brand-pill">{product.brand}</span>
              <div className="modal-rating">
                <Star size={14} fill="#f59e0b" color="#f59e0b" />
                <strong>{product.rating.toFixed(1)}</strong>
                <span className="reviews-count">(128 đánh giá thực tế)</span>
              </div>
            </div>

            <h2 className="modal-product-title">{product.name}</h2>

            <div className="modal-price-panel">
              <div className="price-main-wrap">
                <span className="modal-price-current">{vnd(currentPrice)}</span>
                {currentOldPrice && (
                  <span className="modal-price-old">{vnd(currentOldPrice)}</span>
                )}
                {discountPercent && (
                  <span className="modal-discount-pill">Tiết kiệm {discountPercent}%</span>
                )}
              </div>
              <div className="installment-banner">
                <CreditCard size={14} />
                <span>
                  Tham khảo chia 12 tháng: <strong>{vnd(monthlyInstallment)}/tháng</strong>
                </span>
              </div>
            </div>

            <div className="storage-picker-row">
              <span className="picker-title">Dung lượng bộ nhớ</span>
              {variantError && <p role="alert">{variantError}</p>}
              {!selected && !variantError && <p>Đang tải phiên bản…</p>}
              <div className="storage-chips">
                {variants.map((v) => (
                  <button key={v.variant_id} type="button" className={`storage-chip ${selectedId === v.variant_id ? 'active' : ''}`}
                    aria-pressed={selectedId === v.variant_id} onClick={() => { setSelectedId(v.variant_id); setIsAdded(false) }}>
                    {v.storage}
                  </button>
                ))}
              </div>
            </div>

            {/* DESCRIPTION */}
            <p className="modal-description">{product.description}</p>

            {/* SPECIFICATION MATRIX */}
            <div className="modal-specs-section">
              <h4 className="specs-section-title">Thông số kỹ thuật nổi bật</h4>
              <div className="specs-list-grid">
                <div className="spec-card-mini">
                  <RefreshCw size={16} className="mini-spec-icon" />
                  <div>
                    <span className="spec-key">Màn hình</span>
                    <strong className="spec-val">{product.screen}</strong>
                  </div>
                </div>

                <div className="spec-card-mini">
                  <Cpu size={16} className="mini-spec-icon" />
                  <div>
                    <span className="spec-key">Vi xử lý</span>
                    <strong className="spec-val">{product.chip}</strong>
                  </div>
                </div>

                <div className="spec-card-mini">
                  <Camera size={16} className="mini-spec-icon" />
                  <div>
                    <span className="spec-key">Camera</span>
                    <strong className="spec-val">{product.camera || 'Pro Fusion OIS'}</strong>
                  </div>
                </div>

                <div className="spec-card-mini">
                  <Battery size={16} className="mini-spec-icon" />
                  <div>
                    <span className="spec-key">Dung lượng Pin</span>
                    <strong className="spec-val">{product.battery}</strong>
                  </div>
                </div>
              </div>
            </div>

            {/* ACTION FOOTER */}
            <div className="modal-actions-footer">
              {onAskAI && (
                <button
                  type="button"
                  className="modal-ai-action-btn"
                  onClick={() => {
                    onAskAI(product)
                    onClose()
                  }}
                  title="Hỏi BIX AI tư vấn chuyên sâu về chiếc máy này"
                >
                  <Sparkles size={16} />
                  <span>Nhờ BIX tư vấn</span>
                </button>
              )}

              <button
                type="button"
                className={`modal-buy-action-btn ${isAdded ? 'added' : ''}`}
                onClick={handleAdd}
                disabled={!selected || adding || isAdded}
              >
                {isAdded ? (
                  <>
                    <Check size={18} />
                    <span>Đã thêm vào giỏ hàng!</span>
                  </>
                ) : (
                  <>
                    <ShoppingCart size={18} />
                    <span>Thêm vào giỏ • {vnd(currentPrice)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
