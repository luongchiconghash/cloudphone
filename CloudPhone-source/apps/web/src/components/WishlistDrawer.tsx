import { Heart, X, Trash2, ShoppingCart } from 'lucide-react'
import { vnd, type Product } from '../api'
import { showProductPlaceholder } from '../utils/productImage'

type Props = {
  open: boolean
  wishlist: Product[]
  onClose: () => void
  onRemove: (productId: number) => void
  onClear: () => void
  onAddToCart: (product: Product) => void
  onViewDetails: (product: Product) => void
}

export default function WishlistDrawer({
  open,
  wishlist,
  onClose,
  onRemove,
  onClear,
  onAddToCart,
  onViewDetails,
}: Props) {
  if (!open) return null

  return (
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="cart-drawer wishlist-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div className="drawer-title">
            <Heart size={20} className="wishlist-header-icon" fill="currentColor" />
            <span>Sản phẩm yêu thích ({wishlist.length})</span>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Đóng danh sách yêu thích">
            <X size={20} />
          </button>
        </div>

        <div className="drawer-body">
          {wishlist.length === 0 ? (
            <div className="empty-state-box">
              <div className="empty-icon-circle">
                <Heart size={36} />
              </div>
              <h3>Chưa có sản phẩm nào được lưu</h3>
              <p>Bấm vào biểu tượng trái tim ở bất kỳ máy nào để lưu lại danh sách cần mua nhé!</p>
            </div>
          ) : (
            <div className="wishlist-items-list">
              {wishlist.map((product) => (
                <div key={product.id} className="wishlist-item-card">
                  <div
                    className="wishlist-img-box"
                    onClick={() => {
                      onViewDetails(product)
                      onClose()
                    }}
                  >
                    <img
                      src={product.image}
                      alt={product.name}
                      onError={showProductPlaceholder}
                    />
                  </div>

                  <div className="wishlist-item-info">
                    <span className="brand-tag">{product.brand}</span>
                    <h4
                      className="item-name"
                      onClick={() => {
                        onViewDetails(product)
                        onClose()
                      }}
                    >
                      {product.name}
                    </h4>
                    <div className="item-price">
                      <span className="current">{vnd(product.price)}</span>
                      {product.original_price && (
                        <span className="old">{vnd(product.original_price)}</span>
                      )}
                    </div>

                    <div className="wishlist-item-actions">
                      <button
                        type="button"
                        className="btn-add-cart-mini"
                        onClick={() => onAddToCart(product)}
                      >
                        <ShoppingCart size={13} />
                        <span>Thêm vào giỏ</span>
                      </button>
                      <button
                        type="button"
                        className="btn-remove-mini"
                        onClick={() => onRemove(product.id)}
                        title="Xóa khỏi yêu thích"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {wishlist.length > 0 && (
          <div className="drawer-footer">
            <button type="button" className="btn-clear-all" onClick={onClear}>
              Xóa tất cả yêu thích
            </button>
          </div>
        )}
      </aside>
    </div>
  )
}

