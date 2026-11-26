import { Scale, X, ArrowRight } from 'lucide-react'
import { type Product } from '../api'
import { showProductPlaceholder } from '../utils/productImage'

type Props = {
  compareList: Product[]
  onRemove: (productId: number) => void
  onClear: () => void
  onOpenCompare: () => void
}

export default function CompareFloatingBar({
  compareList,
  onRemove,
  onClear,
  onOpenCompare,
}: Props) {
  if (compareList.length === 0) return null

  return (
    <div className="compare-floating-bar" role="region" aria-label="Thanh so sánh sản phẩm">
      <div className="compare-bar-content">
        <div className="compare-bar-info">
          <div className="compare-bar-badge">
            <Scale size={16} />
            <span>So sánh ({compareList.length}/3)</span>
          </div>
          <span className="compare-bar-hint">
            {compareList.length === 1
              ? 'Chọn thêm 1-2 máy để so sánh chi tiết'
              : 'Đã sẵn sàng so sánh thông số'}
          </span>
        </div>

        <div className="compare-thumbs-row">
          {compareList.map((product) => (
            <div key={product.id} className="compare-thumb-item" title={product.name}>
              <img
                src={product.image}
                alt={product.name}
                onError={showProductPlaceholder}
              />
              <button
                type="button"
                className="compare-remove-btn"
                onClick={() => onRemove(product.id)}
                title={`Bỏ ${product.name}`}
                aria-label={`Bỏ ${product.name}`}
              >
                <X size={12} />
              </button>
            </div>
          ))}

          {Array.from({ length: Math.max(0, 3 - compareList.length) }).map((_, idx) => (
            <div key={`empty-${idx}`} className="compare-thumb-empty" title="Thêm máy để so sánh">
              <span>+</span>
            </div>
          ))}
        </div>

        <div className="compare-bar-actions">
          <button
            type="button"
            className="compare-clear-btn"
            onClick={onClear}
            title="Xóa tất cả"
          >
            Xóa
          </button>
          <button
            type="button"
            className="compare-submit-btn"
            onClick={onOpenCompare}
            disabled={compareList.length < 2}
          >
            <span>So sánh ngay</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

