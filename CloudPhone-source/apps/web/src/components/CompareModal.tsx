import { X, Sparkles, ShoppingCart, Check, Zap, Cpu, Camera, Battery, RefreshCw } from 'lucide-react'
import { vnd, type Product } from '../api'
import { showProductPlaceholder } from '../utils/productImage'

type Props = {
  open: boolean
  products: Product[]
  onClose: () => void
  onAddToCart: (product: Product) => void
  onAskAI?: (prompt: string) => void
}

export default function CompareModal({
  open,
  products,
  onClose,
  onAddToCart,
  onAskAI,
}: Props) {
  if (!open || products.length === 0) return null

  // Generate an automated AI Comparison Verdict
  const generateAIVerdict = () => {
    if (products.length < 2) return null
    const [p1, p2, p3] = products

    const highlights: string[] = []
    
    // Compare Chip
    const p1IsGaming = p1.chip.toLowerCase().includes('snapdragon') || p1.chip.toLowerCase().includes('dimensity') || p1.name.toLowerCase().includes('rog')
    const p1IsApple = p1.brand.toLowerCase() === 'apple'

    highlights.push(
      `• **${p1.name}**: ${
        p1IsApple
          ? 'Tối ưu hệ sinh thái iOS, quay video chuẩn điện ảnh ProRES, giữ giá tốt nhất.'
          : p1IsGaming
          ? 'Hiệu năng đồ họa bứt phá, tản nhiệt tốt, tần số quét cao tối ưu cày game.'
          : 'Màn hình sắc nét, camera đa dụng nhiều tính năng AI.'
      }`
    )

    if (p2) {
      const p2IsApple = p2.brand.toLowerCase() === 'apple'
      const p2IsGaming = p2.chip.toLowerCase().includes('snapdragon') || p2.chip.toLowerCase().includes('dimensity') || p2.name.toLowerCase().includes('rog')
      highlights.push(
        `• **${p2.name}**: ${
          p2IsApple
            ? 'Độ mượt mà iOS lâu dài, camera chân thực, thiết kế sang trọng.'
            : p2IsGaming
            ? 'Tần số quét cao, khả năng duy trì FPS ổn định cho game thủ.'
            : 'Đột phá về cảm biến camera, pin trâu và sạc siêu tốc.'
        }`
      )
    }

    if (p3) {
      highlights.push(
        `• **${p3.name}**: Lựa chọn cân bằng về giá trị, phù hợp người dùng thích trải nghiệm đa nhiệm.`
      )
    }

    return highlights
  }

  const verdicts = generateAIVerdict()

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="compare-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="compare-modal-header">
          <div className="compare-modal-title">
            <span className="badge-pill">So sánh thực chiến</span>
            <h2>So sánh chi tiết thông số kỹ thuật</h2>
          </div>
          <button className="icon-btn-close" onClick={onClose} aria-label="Đóng so sánh">
            <X size={20} />
          </button>
        </div>

        {/* AI INSIGHT SUMMARY */}
        {verdicts && (
          <div className="compare-ai-verdict">
            <div className="verdict-header">
              <Sparkles size={16} className="sparkle-icon" />
              <strong>Góc nhìn chuyên gia BIX AI</strong>
            </div>
            <div className="verdict-content">
              {verdicts.map((v, i) => (
                <p key={i}>{v.split(/\*\*(.*?)\*\*/g).map((part, j) => j % 2 === 1 ? <strong key={j}>{part}</strong> : part)}</p>
              ))}
            </div>
            {onAskAI && (
              <button
                type="button"
                className="verdict-ai-cta"
                onClick={() => {
                  const names = products.map((p) => p.name).join(' và ')
                  onAskAI(`So sánh chi tiết giữa ${names}, tư vấn nên chọn con nào?`)
                  onClose()
                }}
              >
                <span>Hỏi BIX tư vấn nên chốt con nào</span>
                <Sparkles size={14} />
              </button>
            )}
          </div>
        )}

        {/* SPEC COMPARISON TABLE */}
        <div className="compare-table-wrapper">
          <table className="compare-table">
            <thead>
              <tr>
                <th className="spec-name-col">Tiêu chí</th>
                {products.map((p) => (
                  <th key={p.id} className="product-col">
                    <div className="compare-product-card">
                      <div className="compare-img-box">
                        <img
                          src={p.image}
                          alt={p.name}
                          onError={showProductPlaceholder}
                        />
                      </div>
                      <span className="brand-label">{p.brand}</span>
                      <h4 className="compare-p-name">{p.name}</h4>
                      <div className="compare-p-price">
                        <span className="current-price">{vnd(p.price)}</span>
                        {p.original_price && (
                          <span className="old-price">{vnd(p.original_price)}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        className="compare-add-cart-btn"
                        onClick={() => onAddToCart(p)}
                      >
                        <ShoppingCart size={15} />
                        <span>Thêm vào giỏ</span>
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="spec-name-col">
                  <div className="spec-icon-label">
                    <RefreshCw size={14} />
                    <span>Màn hình</span>
                  </div>
                </td>
                {products.map((p) => (
                  <td key={p.id} className="spec-val-col">
                    <strong>{p.screen}</strong>
                  </td>
                ))}
              </tr>

              <tr>
                <td className="spec-name-col">
                  <div className="spec-icon-label">
                    <Cpu size={14} />
                    <span>Chipset & Xử lý</span>
                  </div>
                </td>
                {products.map((p) => (
                  <td key={p.id} className="spec-val-col">
                    <span className="highlight-tag">{p.chip}</span>
                  </td>
                ))}
              </tr>

              <tr>
                <td className="spec-name-col">
                  <div className="spec-icon-label">
                    <Zap size={14} />
                    <span>RAM & Bộ nhớ</span>
                  </div>
                </td>
                {products.map((p) => (
                  <td key={p.id} className="spec-val-col">
                    {p.ram_rom}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="spec-name-col">
                  <div className="spec-icon-label">
                    <Camera size={14} />
                    <span>Camera</span>
                  </div>
                </td>
                {products.map((p) => (
                  <td key={p.id} className="spec-val-col">
                    {p.camera || 'Camera Pro OIS đa tiêu cự'}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="spec-name-col">
                  <div className="spec-icon-label">
                    <Battery size={14} />
                    <span>Pin & Sạc</span>
                  </div>
                </td>
                {products.map((p) => (
                  <td key={p.id} className="spec-val-col">
                    {p.battery}
                  </td>
                ))}
              </tr>

              <tr>
                <td className="spec-name-col">
                  <div className="spec-icon-label">
                    <Check size={14} />
                    <span>Chính sách CloudPhone</span>
                  </div>
                </td>
                {products.map((p) => (
                  <td key={p.id} className="spec-val-col">
                    <div className="policy-list">
                      <span>✓ 1 đổi 1 trong 30 ngày</span>
                      <span>✓ Bảo hành 12 tháng chính hãng</span>
                      <span>✓ Thanh toán khi nhận hàng (COD)</span>
                    </div>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

