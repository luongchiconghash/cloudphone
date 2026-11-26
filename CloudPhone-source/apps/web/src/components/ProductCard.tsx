import { useState } from 'react'
import {
  Heart,
  Scale,
  Zap,
  Cpu,
  Sparkles,
  ShoppingCart,
  Check,
  Star,
  Eye,
  Battery,
  Radio,
} from 'lucide-react'
import { vnd, type Product } from '../api'
import { showProductPlaceholder } from '../utils/productImage'

type Props = {
  product: Product
  isWishlisted?: boolean
  isCompared?: boolean
  onToggleWishlist?: (product: Product) => void
  onToggleCompare?: (product: Product) => void
  onViewDetails: (product: Product) => void
  onAskAI?: (product: Product) => void
  onAddToCart?: (product: Product) => void
}

export default function ProductCard({
  product,
  isWishlisted = false,
  isCompared = false,
  onToggleWishlist,
  onToggleCompare,
  onViewDetails,
  onAskAI,
  onAddToCart,
}: Props) {
  const [isAdded, setIsAdded] = useState(false)

  const discountPercent =
    product.original_price && product.original_price > product.price
      ? Math.round(((product.original_price - product.price) / product.original_price) * 100)
      : null

  // Clean badge text
  const badgeText = product.tag.includes('MỚI')
    ? 'Mới 2026'
    : product.tag.includes('BÁN CHẠY')
    ? 'Bán chạy'
    : product.tag.includes('GAMING')
    ? 'Gaming'
    : product.tag || (discountPercent ? `-${discountPercent}%` : null)

  const handleAdd = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!onAddToCart) return
    onAddToCart(product)
    setIsAdded(true)
    setTimeout(() => setIsAdded(false), 1400)
  }

  // Extract key spec highlights directly from database fields
  const refreshRate = product.screen?.includes('165Hz')
    ? '165Hz'
    : product.screen?.includes('144Hz')
    ? '144Hz'
    : product.screen?.includes('120Hz')
    ? '120Hz'
    : product.screen?.toLowerCase().includes('oled')
    ? 'OLED'
    : null

  const chipShort = product.chip
    ? product.chip
        .replace('Apple ', '')
        .replace('Snapdragon ', 'Snap ')
        .replace('MediaTek ', 'MTK ')
        .replace('Dimensity ', 'Dim ')
        .split(' ')
        .slice(0, 3)
        .join(' ')
    : null

  const chargingWatt = product.battery?.match(/(\d+\s*W)/i)?.[1]?.replace(/\s+/, '') || null
  const batteryCap = product.battery?.match(/(\d+\s*mAh)/i)?.[1] || null

  return (
    <article className="product-card cyber-card">
      {/* TOP FLOATING OVERLAY: BADGE & QUICK ACTIONS */}
      <div className="card-top-bar">
        {badgeText ? (
          <span className="card-badge-pill cyber-badge">{badgeText}</span>
        ) : (
          <span />
        )}

        <div className="card-action-icons">
          {onToggleCompare && (
            <button
              type="button"
              className={`icon-circle-btn ${isCompared ? 'active' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleCompare(product)
              }}
              title={isCompared ? 'Bỏ so sánh' : 'Thêm vào so sánh'}
              aria-label="So sánh máy này"
            >
              <Scale size={14} />
            </button>
          )}

          {onToggleWishlist && (
            <button
              type="button"
              className={`icon-circle-btn ${isWishlisted ? 'active-heart' : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                onToggleWishlist(product)
              }}
              title={isWishlisted ? 'Đã yêu thích' : 'Lưu vào yêu thích'}
              aria-label="Thêm vào yêu thích"
            >
              <Heart
                size={14}
                fill={isWishlisted ? '#ef4444' : 'none'}
                color={isWishlisted ? '#ef4444' : 'currentColor'}
              />
            </button>
          )}
        </div>
      </div>

      {/* PRODUCT IMAGE CONTAINER WITH HUD BRACKETS */}
      <div
        className="card-img-box"
        onClick={() => onViewDetails(product)}
        title={`Xem chi tiết ${product.name}`}
      >
        <div className="hud-corner-bracket tl" />
        <div className="hud-corner-bracket tr" />
        <div className="hud-corner-bracket bl" />
        <div className="hud-corner-bracket br" />
        <img
          key={product.image}
          src={product.image}
          alt={product.name}
          loading="lazy"
          onError={showProductPlaceholder}
        />
        {/* MINI HUD SPEC BAR OVERLAY (ACCURATE REAL SPECS) */}
        <div className="card-hud-spec-bar">
          {refreshRate && (
            <span className="hud-spec-pill" title={`Màn hình: ${product.screen}`}>
              <Zap size={10} />
              <span>{refreshRate}</span>
            </span>
          )}
          {batteryCap && (
            <span className="hud-spec-pill" title={`Pin: ${product.battery}`}>
              <Battery size={10} />
              <span>{batteryCap}</span>
            </span>
          )}
          {chargingWatt && (
            <span className="hud-spec-pill" title={`Sạc nhanh: ${chargingWatt}`}>
              <Zap size={10} />
              <span>{chargingWatt}</span>
            </span>
          )}
        </div>
        <div className="card-img-overlay">
          <span className="quick-view-badge">
            <Eye size={13} />
            <span>Xem thông số chi tiết</span>
          </span>
        </div>
      </div>

      {/* CARD CONTENT */}
      <div className="card-info">
        {/* REAL SPECS TAGS */}
        <div className="card-tech-ribbon">
          {chipShort && (
            <span className="tech-chip-tag" title={product.chip}>
              <Cpu size={11} />
              <span>{chipShort}</span>
            </span>
          )}
        </div>

        {/* BRAND & RATING */}
        <div className="card-brand-row">
          <span className="product-brand-tag">{product.brand}</span>
          <div className="product-rating-box">
            <Star size={12} className="star-icon" fill="currentColor" />
            <span className="rating-score">{product.rating.toFixed(1)}</span>

          </div>
        </div>

        {/* PRODUCT TITLE */}
        <h3
          className="product-name"
          onClick={() => onViewDetails(product)}
          title={product.name}
        >
          {product.name}
        </h3>

        {/* PRICING & INSTALLMENT HINT */}
        <div className="price-container">
          <div className="price-row">
            <span className="price-main">{vnd(product.price)}</span>
            {product.original_price && (
              <span className="price-old">{vnd(product.original_price)}</span>
            )}
            {discountPercent && (
              <span className="discount-badge">-{discountPercent}%</span>
            )}
          </div>

        </div>

        {/* CARD ACTIONS: CHI TIẾT - + GIỎ - HỎI BIX */}
        <div className="card-actions-row">
          <button
            className="card-cta-btn"
            onClick={() => onViewDetails(product)}
            type="button"
            title="Xem chi tiết"
          >
            <span>Chi tiết</span>
          </button>

          {onAddToCart && (
            <button
              className={`card-cart-btn ${isAdded ? 'added' : ''}`}
              onClick={handleAdd}
              type="button"
              title="Thêm vào giỏ"
            >
              {isAdded ? (
                <>
                  <Check size={14} />
                  <span>Đã thêm</span>
                </>
              ) : (
                <>
                  <ShoppingCart size={14} />
                  <span>+ Giỏ</span>
                </>
              )}
            </button>
          )}

          {onAskAI && (
            <button
              className="card-ai-btn"
              onClick={(e) => {
                e.stopPropagation()
                onAskAI(product)
              }}
              title="Nhờ BIX AI tư vấn chiếc máy này"
              type="button"
            >
              <Sparkles size={13} />
              <span>Hỏi BIX</span>
            </button>
          )}
        </div>
      </div>
    </article>
  )
}
