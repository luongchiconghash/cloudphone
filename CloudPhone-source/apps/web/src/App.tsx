import { useEffect, useState, useCallback, useRef } from 'react'
import {
  Search,
  ShoppingBag,
  Sparkles,
  Heart,
  Scale,
  User as UserIcon,
  PackageCheck,
  SlidersHorizontal,
  ArrowUpDown,
  Flame,
  Check,
  X,
  ChevronRight,
  LogOut,
  LayoutGrid,
  ListFilter,
  PhoneCall,
  ShieldCheck,
  Truck,
  RotateCcw,
} from 'lucide-react'
import { api, vnd, type Cart, type Product, type User } from './api'
import ProductCard from './components/ProductCard'
import ProductModal from './components/ProductModal'
import CartDrawer from './components/CartDrawer'
import ChatBot from './components/ChatBot'
import AuthModal from './components/AuthModal'
import CheckoutModal from './components/CheckoutModal'
import type { CheckoutOptions } from './api'
import Toast, { type ToastMessage } from './components/Toast'
import OrderLookupModal from './components/OrderLookupModal'
import HeroSection from './components/HeroSection'
import CompareFloatingBar from './components/CompareFloatingBar'
import CompareModal from './components/CompareModal'
import WishlistDrawer from './components/WishlistDrawer'
import AdminDashboard from './components/AdminDashboard'
import { trackStoreEvent } from './utils/streamTracker'
import { showProductPlaceholder } from './utils/productImage'

const NAV_BRANDS = [
  { id: 'all', label: 'Tất cả', brand: 'All' },
  { id: 'apple', label: 'Apple iPhone', brand: 'Apple' },
  { id: 'samsung', label: 'Samsung Galaxy', brand: 'Samsung' },
  { id: 'xiaomi', label: 'Xiaomi / POCO', brand: 'Xiaomi' },
  { id: 'oppo', label: 'OPPO Find & Reno', brand: 'OPPO' },
  { id: 'vivo', label: 'vivo X Series', brand: 'Vivo' },
  { id: 'realme', label: 'Realme GT', brand: 'Realme' },
  { id: 'asus', label: 'ASUS ROG Phone', brand: 'Asus' },
]

const SMART_FILTERS = [
  { id: 'all', label: 'Tất cả siêu phẩm' },
  { id: 'flagship', label: '⚡ Flagship 2026' },
  { id: 'camera', label: '📷 Camera 200MP Leica/ZEISS' },
  { id: 'gaming', label: '🎮 Chiến game 144Hz+' },
  { id: 'battery', label: '🔋 Pin khủng >5000mAh' },
  { id: 'fold', label: '📱 Màn hình gập' },
  { id: 'budget', label: '💎 Tốt nhất < 15 triệu' },
]

const emptyCart: Cart = { items: [], total: 0, count: 0 }

const isAdminRoute = (pathname: string) => pathname === '/admin' || pathname.startsWith('/admin/')

export default function App() {
  const [products, setProducts] = useState<Product[]>([])
  const [cart, setCart] = useState<Cart>(emptyCart)
  const [selectedBrand, setSelectedBrand] = useState('All')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSearchFocused, setIsSearchFocused] = useState(false)

  // Modals & Drawers state
  const [isCartOpen, setIsCartOpen] = useState(false)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [isOrderLookupOpen, setIsOrderLookupOpen] = useState(false)
  const [isWishlistOpen, setIsWishlistOpen] = useState(false)
  const [isCompareOpen, setIsCompareOpen] = useState(false)
  const [isAdminView, setIsAdminView] = useState(() => isAdminRoute(window.location.pathname))

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // User Authentication State
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [sessionLoading, setSessionLoading] = useState(true)
  const [isPendingCheckout, setIsPendingCheckout] = useState(false)
  const [checkoutOptions, setCheckoutOptions] = useState<CheckoutOptions>({})
  const [isPendingOrders, setIsPendingOrders] = useState(false)
  const [cartBusy, setCartBusy] = useState(false)
  const cartUpdating = useRef(false)

  const [chatInitialPrompt, setChatInitialPrompt] = useState<string | null>(null)

  // Filter & Sort states
  const [sortOption, setSortOption] = useState<'default' | 'price-asc' | 'price-desc' | 'rating-desc'>('default')
  const [priceFilter, setPriceFilter] = useState<'all' | 'under-10' | '10-20' | 'above-20'>('all')
  const [featureFilter, setFeatureFilter] = useState<string>('all')

  // Wishlist state (persisted to localStorage)
  const [wishlistIds, setWishlistIds] = useState<number[]>(() => {
    try {
      const saved = localStorage.getItem('cloudphone_wishlist_ids')
      return saved ? JSON.parse(saved) : []
    } catch {
      return []
    }
  })

  // Compare List state (up to 3 products)
  const [compareList, setCompareList] = useState<Product[]>([])

  const searchBoxRef = useRef<HTMLDivElement>(null)

  // Save wishlist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('cloudphone_wishlist_ids', JSON.stringify(wishlistIds))
    } catch {}
  }, [wishlistIds])

  // Ghi nhận lượt truy cập trang bán hàng của khách
  useEffect(() => {
    if (!isAdminRoute(window.location.pathname)) {
      trackStoreEvent('page_view')
    }
  }, [])

  // Ghi nhận sự kiện khi người dùng mở xem chi tiết một sản phẩm
  useEffect(() => {
    if (selectedProduct) {
      trackStoreEvent('view_product')
    }
  }, [selectedProduct])

  // Ghi nhận sự kiện khi người dùng lọc theo thương hiệu
  useEffect(() => {
    if (selectedBrand && selectedBrand !== 'All') {
      trackStoreEvent('filter_brand')
    }
  }, [selectedBrand])

  // Ghi nhận sự kiện tìm kiếm (debounce 800ms)
  const searchDebounceRef = useRef<any>(null)
  useEffect(() => {
    if (searchQuery.trim().length >= 2) {
      clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = setTimeout(() => {
        trackStoreEvent('search')
      }, 800)
    }
    return () => clearTimeout(searchDebounceRef.current)
  }, [searchQuery])

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'warning' = 'info') => {
    const id = crypto.randomUUID()
    setToasts((prev) => [...prev, { id, text: message, type }])
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id))
    }, 3500)
  }, [])

  const catalogRequest = useRef<AbortController | null>(null)
  const loadProducts = useCallback(async (brand: string, query: string) => {
    catalogRequest.current?.abort()
    const controller = new AbortController()
    catalogRequest.current = controller
    setLoading(true)
    setError('')
    try {
      const params: Record<string, string> = {}
      if (brand !== 'All') params.brand = brand
      if (query.trim()) params.q = query.trim()
      const data = await api.products(params, controller.signal)
      if (!controller.signal.aborted) setProducts(data)
    } catch (e: unknown) {
      if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Lỗi khi tải dữ liệu sản phẩm')
    } finally {
      if (!controller.signal.aborted) setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadProducts(selectedBrand, searchQuery), searchQuery ? 250 : 0)
    return () => {
      window.clearTimeout(timer)
      catalogRequest.current?.abort()
    }
  }, [loadProducts, selectedBrand, searchQuery])

  useEffect(() => {
    api.auth.me().then((res) => setCurrentUser(res.user)).catch(() => {}).finally(() => setSessionLoading(false))
    api.cart().then(setCart).catch(() => {})
    const onPopState = () => setIsAdminView(isAdminRoute(window.location.pathname))
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigateAdmin = (open: boolean) => {
    const nextPath = open ? '/admin' : '/'
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, '', nextPath)
    }
    setIsAdminView(open)
    window.scrollTo({ top: 0 })
  }

  // Close search popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setIsSearchFocused(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleAddToCart = async (product: Product, variantId?: string) => {
    if (cartUpdating.current) return false
    cartUpdating.current = true
    setCartBusy(true)
    try {
      const updated = await api.add(product.id, variantId)
      setCart(updated)
      showToast(`Đã thêm "${product.name}" vào giỏ hàng!`, 'success')
      return true
    } catch (err: unknown) {
      showToast(`Không thể thêm vào giỏ: ${err instanceof Error ? err.message : 'Lỗi kết nối'}`, 'warning')
      return false
    } finally {
      cartUpdating.current = false
      setCartBusy(false)
    }
  }

  const handleUpdateQty = async (variantId: string, qty: number) => {
    if (cartUpdating.current) return
    cartUpdating.current = true
    setCartBusy(true)
    try {
      const updated = await api.setQty(variantId, qty)
      setCart(updated)
      if (qty === 0) showToast('Đã xóa sản phẩm khỏi giỏ hàng')
    } catch (err: unknown) {
      showToast(`Lỗi: ${err instanceof Error ? err.message : 'Thao tác thất bại'}`, 'warning')
    } finally {
      cartUpdating.current = false
      setCartBusy(false)
    }
  }

  const handleClearCart = async () => {
    if (cartUpdating.current || !window.confirm('Bạn có chắc chắn muốn xóa toàn bộ giỏ hàng?')) return
    cartUpdating.current = true
    setCartBusy(true)
    try {
      const updated = await api.clear()
      setCart(updated)
      showToast('Đã xóa sạch giỏ hàng')
    } catch (err: unknown) {
      showToast(`Lỗi: ${err instanceof Error ? err.message : 'Thao tác thất bại'}`, 'warning')
    } finally {
      cartUpdating.current = false
      setCartBusy(false)
    }
  }

  const openCart = async () => {
    setIsCartOpen(true)
    if (cartUpdating.current) return
    cartUpdating.current = true
    setCartBusy(true)
    try {
      setCart(await api.cart())
    } catch {
      showToast('Không thể tải lại giỏ hàng.', 'warning')
    } finally {
      cartUpdating.current = false
      setCartBusy(false)
    }
  }

  // Wishlist toggling
  const handleToggleWishlist = (product: Product) => {
    setWishlistIds((prev) => {
      const exists = prev.includes(product.id)
      if (exists) {
        showToast(`Đã bỏ lưu "${product.name}" khỏi danh sách yêu thích`)
        return prev.filter((id) => id !== product.id)
      } else {
        showToast(`Đã thêm "${product.name}" vào danh sách yêu thích!`, 'success')
        return [...prev, product.id]
      }
    })
  }

  // Compare toggling
  const handleToggleCompare = (product: Product) => {
    setCompareList((prev) => {
      const exists = prev.some((p) => p.id === product.id)
      if (exists) {
        return prev.filter((p) => p.id !== product.id)
      }
      if (prev.length >= 3) {
        showToast('Chỉ có thể so sánh tối đa 3 máy cùng lúc!', 'warning')
        return prev
      }
      showToast(`Đã thêm "${product.name}" vào so sánh`, 'info')
      const updated = [...prev, product]
      trackStoreEvent('compare_products')
      return updated
    })
  }

  const handleCheckoutClick = (options: CheckoutOptions) => {
    if (cartUpdating.current || !cart.items.length) return
    setCheckoutOptions(options)
    if (!currentUser) {
      setIsPendingCheckout(true)
      setIsAuthOpen(true)
      showToast('Vui lòng đăng nhập hoặc tạo tài khoản để đặt hàng!')
      return
    }
    setIsCartOpen(false)
    setIsCheckoutOpen(true)
  }

  const handleCheckoutSuccess = () => {
    setCart((previous) => ({ ...previous, items: [], count: 0, total: 0 }))
    api.cart().then(setCart).catch(() => {})
    showToast('Đặt hàng thành công!', 'success')
  }

  const openOrders = () => {
    if (currentUser) setIsOrderLookupOpen(true)
    else {
      setIsPendingOrders(true)
      setIsAuthOpen(true)
    }
  }

  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user)
    showToast(`Xin chào ${user.username}! Đăng nhập thành công`, 'success')
    if (user.role === 'admin' || user.role === 'staff') {
      setIsPendingOrders(false)
      setIsPendingCheckout(false)
      setIsCartOpen(false)
      setIsOrderLookupOpen(false)
      setIsCheckoutOpen(false)
      navigateAdmin(true)
      return
    }
    if (isPendingOrders) {
      setIsPendingOrders(false)
      setIsOrderLookupOpen(true)
    }
    if (isPendingCheckout) {
      setIsPendingCheckout(false)
      setIsCartOpen(false)
      setIsCheckoutOpen(true)
    }
  }

  const handleAskAI = (p: Product) => {
    setChatInitialPrompt(`Tư vấn cho tôi về chiếc ${p.name} này có ưu nhược điểm gì và có nên mua không?`)
    setIsChatOpen(true)
    if (selectedProduct) setSelectedProduct(null)
  }

  const handleAskAIPrompt = (prompt: string) => {
    setChatInitialPrompt(prompt)
    setIsChatOpen(true)
  }

  const handleLogout = async () => {
    if (window.confirm(`Bạn có chắc chắn muốn đăng xuất khỏi tài khoản: ${currentUser?.username}?`)) {
      try {
        await api.auth.logout()
        setCurrentUser(null)
        setIsOrderLookupOpen(false)
        setIsCheckoutOpen(false)
        showToast('Đã đăng xuất tài khoản')
      } catch {
        showToast('Chưa thể đăng xuất. Vui lòng thử lại.', 'warning')
      }
    }
  }

  // Filter and sort products
  const filteredProducts = products.filter((p) => {
    // 1. Price bracket
    if (priceFilter === 'under-10' && p.price >= 10_000_000) return false
    if (priceFilter === '10-20' && (p.price < 10_000_000 || p.price > 20_000_000)) return false
    if (priceFilter === 'above-20' && p.price <= 20_000_000) return false

    // 2. Feature category
    if (featureFilter === 'flagship') {
      const isFlagship =
        p.price >= 24_000_000 ||
        p.chip?.includes('A20') ||
        p.chip?.includes('Elite') ||
        p.tag?.toLowerCase().includes('flagship')
      if (!isFlagship) return false
    }

    if (featureFilter === 'camera') {
      const isCamera =
        p.tag?.toLowerCase().includes('camera') ||
        p.camera?.toLowerCase().includes('leica') ||
        p.camera?.toLowerCase().includes('zeiss') ||
        p.camera?.toLowerCase().includes('fusion') ||
        p.camera?.toLowerCase().includes('tiềm vọng')
      if (!isCamera) return false
    }

    if (featureFilter === 'gaming') {
      const isGaming =
        p.tag?.toLowerCase().includes('gaming') ||
        p.screen?.includes('144Hz') ||
        p.screen?.includes('165Hz') ||
        p.name.toLowerCase().includes('rog')
      if (!isGaming) return false
    }

    if (featureFilter === 'battery') {
      const isBattery =
        p.battery?.includes('6000') ||
        p.battery?.includes('5500') ||
        p.battery?.includes('5400') ||
        p.battery?.includes('5000')
      if (!isBattery) return false
    }

    if (featureFilter === 'fold') {
      const isFold =
        p.tag?.toLowerCase().includes('fold') ||
        p.name.toLowerCase().includes('gập') ||
        p.screen?.toLowerCase().includes('gập')
      if (!isFold) return false
    }

    if (featureFilter === 'budget') {
      if (p.price > 15_000_000) return false
    }

    return true
  })

  // Sort
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    if (sortOption === 'price-asc') return a.price - b.price
    if (sortOption === 'price-desc') return b.price - a.price
    if (sortOption === 'rating-desc') return b.rating - a.rating
    return 0
  })

  // Full wishlist product objects
  const wishlistProducts = products.filter((p) => wishlistIds.includes(p.id))

  // Live Autocomplete matches
  const autocompleteMatches = searchQuery.trim()
    ? products
        .filter((p) => p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        .slice(0, 4)
    : []

  const isStaffUser = !!currentUser && (currentUser.role === 'staff' || currentUser.role === 'admin')

  if (isAdminView) {
    return (
      <>
        <AdminDashboard
          user={currentUser}
          sessionLoading={sessionLoading}
          onBackToStore={() => navigateAdmin(false)}
          onOpenAuth={() => setIsAuthOpen(true)}
          onLogout={handleLogout}
          onCatalogChanged={() => loadProducts(selectedBrand, searchQuery)}
          showToast={showToast}
        />
        <AuthModal
          open={isAuthOpen}
          onClose={() => {
            setIsAuthOpen(false)
            setIsPendingCheckout(false)
            setIsPendingOrders(false)
          }}
          onSuccess={handleAuthSuccess}
          isCheckoutTrigger={isPendingCheckout}
        />
        <Toast toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
      </>
    )
  }

  return (
    <div className="cloudphone-app-root">
      {/* 1. TOP ANNOUNCEMENT BAR WITH LIVE SYSTEM BEACON */}
      <div className="top-announcement-bar cyber-announcement-bar">
        <div className="announcement-content">
          <div className="announcement-left-group">
            <div className="cyber-status-beacon">
              <span className="beacon-pulse-dot" />
              <span className="beacon-text">BIX AI • TƯ VẤN 24/7</span>
            </div>
            <div className="announcement-item">
              <Flame size={14} className="accent-flame" />
              <span>Mở bán sớm iPhone 18 Series & Xiaomi 17 Ultra • Giảm trực tiếp 3.000.000đ khi đặt trước hôm nay!</span>
            </div>
          </div>
          <div className="announcement-links">
            <button
              type="button"
              className="top-link-btn"
              onClick={openOrders}
            >
              <PackageCheck size={14} />
              <span>Tra cứu đơn hàng</span>
            </button>
            <span className="divider">•</span>
          </div>
        </div>
      </div>

      {/* 2. FROSTED GLASS MAIN HEADER */}
      <header className="site-header cyber-header">
        <div className="header-inner">
          {/* BRAND LOGO */}
          <div
            className="header-brand"
            onClick={() => {
              setSelectedBrand('All')
              setSearchQuery('')
              setFeatureFilter('all')
              setPriceFilter('all')
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            <div className="brand-logo-mark">
              <span className="logo-letter">C</span>
              <span className="logo-glow-dot" />
            </div>
            <div className="brand-text-block">
              <div className="brand-title-row">
                <span className="brand-title">CloudPhone</span>

              </div>
              <span className="brand-subtext">ĐIỆN THOẠI &amp; TƯ VẤN</span>
            </div>
          </div>

          {/* SEARCH BAR WITH LIVE AUTOCOMPLETE POPUP */}
          <div className="header-search-wrap" ref={searchBoxRef}>
            <div className={`search-input-pill ${isSearchFocused ? 'focused' : ''}`}>
              <Search size={17} className="search-icon" />
              <input
                type="text"
                placeholder="Tìm iPhone 18 Pro Max, Xiaomi 17 Ultra, ROG Phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setIsSearchFocused(true)}
                aria-label="Tìm kiếm sản phẩm"
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery('')}
                  aria-label="Xóa từ khóa"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* LIVE AUTOCOMPLETE DROPDOWN */}
            {isSearchFocused && autocompleteMatches.length > 0 && (
              <div className="search-autocomplete-dropdown">
                <div className="dropdown-heading">Gợi ý sản phẩm phù hợp:</div>
                {autocompleteMatches.map((item) => (
                  <div
                    key={item.id}
                    className="dropdown-match-row"
                    onClick={() => {
                      setSelectedProduct(item)
                      setIsSearchFocused(false)
                    }}
                  >
                    <img src={item.image} alt={item.name} className="dropdown-thumb" onError={showProductPlaceholder} />
                    <div className="dropdown-info">
                      <span className="match-name">{item.name}</span>
                      <span className="match-brand">{item.brand} • {item.tag}</span>
                    </div>
                    <span className="match-price">{vnd(item.price)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT ACTION BUTTONS */}
          <div className="header-actions">
            {/* TRA CỨU ĐƠN HÀNG */}
            <button
              type="button"
              className="action-pill-btn hide-on-mobile"
              onClick={openOrders}
              title="Tra cứu tình trạng đơn hàng"
            >
              <PackageCheck size={16} />
              <span>Tra cứu đơn</span>
            </button>

            {isStaffUser && (
              <button
                type="button"
                className="action-pill-btn admin-nav-pill"
                onClick={() => navigateAdmin(true)}
                title="Mở trang quản trị kho hàng và đơn hàng"
              >
                <ShieldCheck size={16} />
                <span>Quản trị kho</span>
              </button>
            )}

            {/* SO SÁNH */}
            {compareList.length > 0 && (
              <button
                type="button"
                className="action-icon-pill highlight-scale"
                onClick={() => setIsCompareOpen(true)}
                title="Mở danh sách so sánh"
              >
                <Scale size={18} />
                <span className="badge-count">{compareList.length}</span>
              </button>
            )}

            {/* YÊU THÍCH (WISHLIST) */}
            <button
              type="button"
              className="action-icon-pill"
              onClick={() => setIsWishlistOpen(true)}
              title="Xem sản phẩm đã lưu"
            >
              <Heart size={18} fill={wishlistIds.length > 0 ? '#ef4444' : 'none'} color={wishlistIds.length > 0 ? '#ef4444' : 'currentColor'} />
              {wishlistIds.length > 0 && (
                <span className="badge-count wishlist">{wishlistIds.length}</span>
              )}
            </button>

            {/* GIỎ HÀNG */}
            <button
              type="button"
              className="action-cart-btn"
              onClick={openCart}
              title="Mở giỏ hàng"
            >
              <ShoppingBag size={18} />
              <span className="cart-label hide-on-mobile">Giỏ hàng</span>
              {cart.count > 0 && <span className="cart-badge-count">{cart.count}</span>}
            </button>

            {/* USER LOGIN / ACCOUNT */}
            {currentUser ? (
              <div className="user-profile-menu">
                <button
                  type="button"
                  className="user-btn-logged"
                  onClick={handleLogout}
                  title="Bấm để đăng xuất"
                >
                  <UserIcon size={16} />
                  <span>{currentUser.username}</span>
                  <LogOut size={14} className="logout-icon" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="action-login-btn"
                onClick={() => setIsAuthOpen(true)}
              >
                <UserIcon size={16} />
                <span>Đăng nhập</span>
              </button>
            )}
          </div>
        </div>

        {/* SECONDARY BRAND SCROLL TABS */}
        <nav className="secondary-brand-nav">
          <div className="brand-tabs-scroll">
            {NAV_BRANDS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`brand-nav-chip ${selectedBrand === tab.brand ? 'active' : ''}`}
                onClick={() => {
                  setSelectedBrand(tab.brand)
                  setSearchQuery('')
                }}
              >
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>
      </header>

      {/* 3. HERO KEYNOTE SPOTLIGHT STAGE */}
      <HeroSection
        products={products}
        onSelectProduct={(p) => setSelectedProduct(p)}
        onAskAI={handleAskAIPrompt}
      />

      {/* 4. MAIN CONTENT CONTAINER */}
      <main className="main-catalog-container">
        {/* SMART NEED FILTER PILLS */}
        <div className="smart-filters-bar">
          <div className="filters-header">
            <div className="filters-title">
              <SlidersHorizontal size={16} />
              <span>Lọc theo nhu cầu thực tế:</span>
            </div>
            <span className="catalog-count-badge">
              Tìm thấy <strong>{sortedProducts.length}</strong> máy
            </span>
          </div>

          <div className="smart-filter-chips-row">
            {SMART_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                className={`smart-chip ${featureFilter === f.id ? 'active' : ''}`}
                onClick={() => setFeatureFilter(f.id)}
              >
                {featureFilter === f.id && <Check size={13} className="check-icon" />}
                <span>{f.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* PRICE & SORT CONTROL BAR */}
        <div className="catalog-toolbar-panel">
          <div className="toolbar-left">
            <span className="filter-label">Mức giá:</span>
            <div className="price-filter-chips">
              <button
                type="button"
                className={`price-chip ${priceFilter === 'all' ? 'active' : ''}`}
                onClick={() => setPriceFilter('all')}
              >
                Tất cả
              </button>
              <button
                type="button"
                className={`price-chip ${priceFilter === 'under-10' ? 'active' : ''}`}
                onClick={() => setPriceFilter('under-10')}
              >
                Dưới 10 triệu
              </button>
              <button
                type="button"
                className={`price-chip ${priceFilter === '10-20' ? 'active' : ''}`}
                onClick={() => setPriceFilter('10-20')}
              >
                10 - 20 triệu
              </button>
              <button
                type="button"
                className={`price-chip ${priceFilter === 'above-20' ? 'active' : ''}`}
                onClick={() => setPriceFilter('above-20')}
              >
                Trên 20 triệu
              </button>
            </div>
          </div>

          <div className="toolbar-right">
            <div className="sort-select-wrap">
              <ArrowUpDown size={15} className="sort-icon" />
              <select
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value as any)}
                aria-label="Sắp xếp sản phẩm"
              >
                <option value="default">Sắp xếp: Mới & Bán chạy nhất</option>
                <option value="price-asc">Giá: Thấp đến Cao</option>
                <option value="price-desc">Giá: Cao đến Thấp</option>
                <option value="rating-desc">Đánh giá: Cao nhất</option>
              </select>
            </div>
          </div>
        </div>

        {/* PRODUCTS GRID */}
        {loading ? (
          <div className="catalog-loading-state">
            <div className="loading-spinner" />
            <p>Đang tải danh sách smartphone chính hãng từ hệ thống CloudPhone...</p>
          </div>
        ) : error ? (
          <div className="catalog-error-state">
            <p>{error}</p>
            <button
              type="button"
              className="btn-retry"
              onClick={() => loadProducts(selectedBrand, searchQuery)}
            >
              Thử tải lại
            </button>
          </div>
        ) : sortedProducts.length === 0 ? (
          <div className="catalog-empty-state">
            <div className="empty-box-icon">📱</div>
            <h3>Không tìm thấy sản phẩm phù hợp</h3>
            <p>Hãy thử xóa bớt bộ lọc hoặc nhờ BIX AI tư vấn chiếc máy phù hợp với bạn nhé!</p>
            <button
              type="button"
              className="btn-ask-bix-empty"
              onClick={() => {
                setChatInitialPrompt('Tư vấn cho tôi chiếc điện thoại tốt nhất hiện tại')
                setIsChatOpen(true)
              }}
            >
              <Sparkles size={16} />
              <span>Hỏi BIX AI gợi ý máy</span>
            </button>
          </div>
        ) : (
          <div className="product-cards-grid">
            {sortedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                isWishlisted={wishlistIds.includes(product.id)}
                isCompared={compareList.some((p) => p.id === product.id)}
                onToggleWishlist={handleToggleWishlist}
                onToggleCompare={handleToggleCompare}
                onViewDetails={(p) => setSelectedProduct(p)}
                onAddToCart={handleAddToCart}
                onAskAI={handleAskAI}
              />
            ))}
          </div>
        )}
      </main>

      {/* 5. FLOATING BIX AI COPILOT LAUNCHER */}
      <div className="bix-copilot-launcher">
        <button
          type="button"
          className="bix-floating-orb"
          onClick={() => setIsChatOpen(!isChatOpen)}
          aria-label="Tư vấn cùng BIX AI"
        >
          <div className="orb-pulse-ring" />
          <div className="orb-inner">
            <Sparkles size={20} className="orb-sparkle-icon" />
          </div>
          <span className="orb-label">Hỏi BIX AI</span>
          <span className="orb-status-dot" />
        </button>
      </div>

      {/* 6. FLOATING COMPARE DOCK */}
      <CompareFloatingBar
        compareList={compareList}
        onRemove={(id) => setCompareList((prev) => prev.filter((p) => p.id !== id))}
        onClear={() => setCompareList([])}
        onOpenCompare={() => setIsCompareOpen(true)}
      />

      {/* 7. E-COMMERCE FOOTER */}
      <footer className="site-footer">
        <div className="footer-top-grid">
          <div className="footer-col brand-col">
            <div className="footer-logo">
              <span className="logo-badge">C</span>
              <span className="logo-title">CloudPhone</span>
            </div>
            <p className="footer-desc">
              Hệ thống bán lẻ điện thoại flagship và công nghệ cao cấp hàng đầu Việt Nam. Tích hợp trợ lý AI thông minh BIX tư vấn 24/7.
            </p>
            <div className="footer-promises">
              <div className="promise-tag">✓ 100% Hàng chính hãng Fullbox</div>
              <div className="promise-tag">✓ 1 đổi 1 trong 30 ngày</div>
              <div className="promise-tag">✓ Hỏa tốc 1 giờ nội thành</div>
            </div>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Cửa hàng trực tuyến</h4>
            <ul className="footer-links-list">
              <li>Địa chỉ: Số 168 Đường Lương Ngọc Quyến, P. Quang Trung, TP. Thái Nguyên, Tỉnh Thái Nguyên.</li>
              <li>Giờ mở cửa: 08:00 - 21:30 (Thứ 2 - Chủ nhật).</li>
              <li>Đặt hàng trực tuyến 24/7 · Giao hàng toàn quốc.</li>
            </ul>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Chính sách & Hỗ trợ</h4>
            <ul className="footer-links-list">
              <li>
                <button
                  type="button"
                  className="footer-btn-link"
                  onClick={openOrders}
                >
                  Tra cứu thông tin đơn hàng
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-btn-link"
                  onClick={() => handleAskAIPrompt('Chính sách bảo hành 1 đổi 1 tại CloudPhone như thế nào?')}
                >
                  Chính sách bảo hành 1 đổi 1
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-btn-link"
                  onClick={() => handleAskAIPrompt('CloudPhone hỗ trợ thanh toán bằng cách nào?')}
                >
                  Phương thức thanh toán
                </button>
              </li>
              <li>
                <button
                  type="button"
                  className="footer-btn-link"
                  onClick={() => handleAskAIPrompt('Chương trình thu cũ đổi mới trợ giá ra sao?')}
                >
                  Thu cũ đổi mới trợ giá tới 4 triệu
                </button>
              </li>
            </ul>
          </div>

          <div className="footer-col">
            <h4 className="footer-heading">Phương thức thanh toán</h4>
            <div className="payment-badges-row">
              <span className="pay-badge">COD</span>
              {cart.qr_available && <span className="pay-badge">VietQR</span>}
            </div>
          </div>
        </div>

        <div className="footer-bottom-bar">
          <p>© 2026 CloudPhone · Hệ thống bán lẻ điện thoại chính hãng.</p>
        </div>
      </footer>

      {/* 8. MODALS & DRAWERS */}
      <ProductModal
        key={selectedProduct?.id ?? 0}
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
        onAskAI={handleAskAI}
      />

      <CartDrawer
        open={isCartOpen}
        cart={cart}
        busy={cartBusy}
        user={currentUser}
        onClose={() => setIsCartOpen(false)}
        onUpdateQty={handleUpdateQty}
        onClearCart={handleClearCart}
        onCheckoutSuccess={handleCheckoutClick}
      />

      <WishlistDrawer
        open={isWishlistOpen}
        wishlist={wishlistProducts}
        onClose={() => setIsWishlistOpen(false)}
        onRemove={(id) => setWishlistIds((prev) => prev.filter((i) => i !== id))}
        onClear={() => setWishlistIds([])}
        onAddToCart={handleAddToCart}
        onViewDetails={(p) => setSelectedProduct(p)}
      />

      <CompareModal
        open={isCompareOpen}
        products={compareList}
        onClose={() => setIsCompareOpen(false)}
        onAddToCart={handleAddToCart}
        onAskAI={handleAskAIPrompt}
      />

      {isCheckoutOpen && currentUser && (
        <CheckoutModal cart={cart} user={currentUser} options={checkoutOptions}
          onClose={() => setIsCheckoutOpen(false)} onSuccess={handleCheckoutSuccess} />
      )}

      {isOrderLookupOpen && currentUser && (
        <OrderLookupModal onClose={() => setIsOrderLookupOpen(false)} onAskAI={handleAskAIPrompt} />
      )}

      <AuthModal
        open={isAuthOpen}
        onClose={() => {
          setIsAuthOpen(false)
          setIsPendingCheckout(false)
          setIsPendingOrders(false)
        }}
        onSuccess={handleAuthSuccess}
        isCheckoutTrigger={isPendingCheckout}
      />

      <ChatBot
        open={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        onAddToCart={handleAddToCart}
        onViewProductDetails={(p) => setSelectedProduct(p)}
        initialPrompt={chatInitialPrompt}
        onClearInitialPrompt={() => setChatInitialPrompt(null)}
      />

      {/* 9. TOAST NOTIFICATIONS */}
      <Toast toasts={toasts} onClose={(id) => setToasts((prev) => prev.filter((t) => t.id !== id))} />
    </div>
  )
}
