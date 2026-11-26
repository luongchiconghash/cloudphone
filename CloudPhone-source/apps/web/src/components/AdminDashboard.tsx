import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  BarChart3,
  Boxes,
  Check,
  CheckCircle2,
  Database,
  ClipboardList,
  Edit3,
  LogOut,
  Package,
  PackagePlus,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Truck,
  User as UserIcon,
  Wallet,
  X,
} from 'lucide-react'
import { api, vnd, type AdminOverview, type AdminProductInput, type AdminTrafficReport, type Order, type Product, type User } from '../api'
import { PLACEHOLDER_IMAGE, showProductPlaceholder } from '../utils/productImage'
import TrafficAnalyticsView from './TrafficAnalyticsView'
import './AdminDashboard.css'

type Props = {
  user: User | null
  sessionLoading: boolean
  onBackToStore: () => void
  onOpenAuth: () => void
  onLogout: () => void
  onCatalogChanged: () => void
  showToast: (text: string, type?: 'success' | 'info' | 'warning') => void
}

const BRANDS = ['All', 'Apple', 'Samsung', 'Xiaomi', 'OPPO', 'Vivo', 'Realme', 'Asus', 'Google']
const ORDER_STATUSES = ['Đang xử lý', 'Đã xác nhận', 'Đang giao hàng', 'Giao thành công', 'Đã hủy']

const NEXT_STATUS_ACTION: Record<string, { next: string; label: string }> = {
  'Đang xử lý': { next: 'Đã xác nhận', label: 'Xác nhận đơn' },
  'Đã xác nhận': { next: 'Đang giao hàng', label: 'Giao bưu tá' },
  'Đang giao hàng': { next: 'Giao thành công', label: 'Hoàn tất giao' },
}

const emptyForm: AdminProductInput = {
  name: '',
  brand: 'Apple',
  price: 19990000,
  original_price: null,
  stock: 10,
  image: PLACEHOLDER_IMAGE,
  chip: '',
  screen: '',
  ram_rom: '12GB / 256GB',
  battery: '',
  camera: '',
  tag: 'MỚI',
  description: '',
}

export default function AdminDashboard({
  user,
  sessionLoading,
  onBackToStore,
  onOpenAuth,
  onLogout,
  onCatalogChanged,
  showToast,
}: Props) {
  const isStaff = !!user && (user.role === 'staff' || user.role === 'admin')

  const [tab, setTab] = useState<'inventory' | 'orders' | 'traffic'>(() =>
    window.location.pathname === '/admin/traffic' ? 'traffic' : 'inventory'
  )
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [trafficReport, setTrafficReport] = useState<AdminTrafficReport | null>(null)
  const [trafficDays, setTrafficDays] = useState<7 | 14 | 30>(14)
  const [products, setProducts] = useState<Product[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [reload, setReload] = useState(0)
  const loadVersion = useRef(0)
  const productDialog = useRef<HTMLDialogElement>(null)
  const [busyId, setBusyId] = useState<string | number | null>(null)

  // Inventory filters
  const [prodQuery, setProdQuery] = useState('')
  const [prodBrand, setProdBrand] = useState('All')
  const [stockFilter, setStockFilter] = useState<'all' | 'low' | 'out'>('all')
  const [stockDrafts, setStockDrafts] = useState<Record<number, string>>({})

  // Order filters
  const [orderQuery, setOrderQuery] = useState('')
  const [orderStatus, setOrderStatus] = useState('all')

  // Product modal form
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [form, setForm] = useState<AdminProductInput>(emptyForm)
  const [savingForm, setSavingForm] = useState(false)
  const [formError, setFormError] = useState('')

  const loadAll = useCallback(async () => {
    if (!isStaff) return
    const version = ++loadVersion.current
    setLoading(true)
    setLoadError('')
    try {
      const [ov, prodRes, ordRes, trafRes] = await Promise.all([
        api.admin.overview(),
        api.admin.products({ brand: prodBrand, q: prodQuery.trim(), stock_filter: stockFilter }),
        api.admin.orders({ status: orderStatus, q: orderQuery.trim() }),
        api.admin.traffic(trafficDays),
      ])
      if (version !== loadVersion.current) return
      setOverview(ov)
      setProducts(prodRes.products)
      setOrders(ordRes.orders)
      setTrafficReport(trafRes)
      const drafts: Record<number, string> = {}
      for (const p of prodRes.products) drafts[p.id] = String(p.stock)
      setStockDrafts(drafts)
    } catch (err: unknown) {
      if (version === loadVersion.current) {
        setLoadError(err instanceof Error ? err.message : 'Không tải được dữ liệu quản trị')
      }
    } finally {
      if (version === loadVersion.current) setLoading(false)
    }
  }, [isStaff, prodBrand, prodQuery, stockFilter, orderStatus, orderQuery, trafficDays])

  const switchTab = (next: 'inventory' | 'orders' | 'traffic') => {
    setTab(next)
    const targetPath = next === 'traffic' ? '/admin/traffic' : '/admin'
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath)
    }
    window.scrollTo({ top: 0 })
  }

  useEffect(() => {
    const onPop = () => {
      if (window.location.pathname === '/admin/traffic') setTab('traffic')
      else if (window.location.pathname === '/admin') setTab((prev) => (prev === 'traffic' ? 'inventory' : prev))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  useEffect(() => {
    if (!isStaff) return
    const timer = window.setTimeout(() => void loadAll(), 180)
    return () => {
      window.clearTimeout(timer)
      ++loadVersion.current
    }
  }, [isStaff, loadAll, reload])

  useEffect(() => {
    if (isFormOpen) productDialog.current?.showModal()
  }, [isFormOpen])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await api.admin.syncVectors()
      showToast('Đã đồng bộ ' + (result.total_synced ?? 0) + ' mục tư vấn.', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Không đồng bộ được dữ liệu tư vấn.', 'warning')
    } finally {
      setSyncing(false)
    }
  }

  const handleAdjustStock = async (product: Product, payload: { stock?: number; delta?: number }) => {
    if (busyId !== null) return
    setBusyId(product.id)
    try {
      const res = await api.admin.adjustStock(product.id, payload)
      setProducts((prev) => prev.map((p) => (p.id === product.id ? res.product : p)))
      setStockDrafts((prev) => ({ ...prev, [product.id]: String(res.product.stock) }))
      onCatalogChanged()
      setReload((value) => value + 1)
      showToast(`Đã cập nhật tồn kho "${res.product.name}": ${res.product.stock} máy`, 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Lỗi cập nhật tồn kho', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const openCreateModal = () => {
    setEditingProduct(null)
    setForm(emptyForm)
    setFormError('')
    setIsFormOpen(true)
  }

  const openEditModal = (p: Product) => {
    setEditingProduct(p)
    setFormError('')
    setForm({
      name: p.name,
      brand: p.brand,
      price: p.price,
      original_price: p.original_price,
      stock: p.stock ?? 0,
      image: p.image,
      chip: p.chip,
      screen: p.screen,
      ram_rom: p.ram_rom,
      battery: p.battery,
      camera: p.camera ?? '',
      tag: p.tag ?? '',
      description: p.description ?? '',
    })
    setIsFormOpen(true)
  }

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault()
    if (savingForm) return
    setSavingForm(true)
    setFormError('')
    try {
      const payload: AdminProductInput = {
        ...form,
        name: form.name.trim(),
        brand: form.brand.trim(),
        price: Number(form.price),
        original_price: form.original_price ? Number(form.original_price) : null,
        stock: Number(form.stock),
      }
      if (editingProduct) {
        const { stock, ...details } = payload
        await api.admin.updateProduct(editingProduct.id, stock === editingProduct.stock ? details : payload)
        showToast(`Đã cập nhật sản phẩm "${payload.name}"`, 'success')
      } else {
        await api.admin.createProduct(payload)
        showToast(`Đã thêm mới "${payload.name}" vào kho`, 'success')
      }
      setIsFormOpen(false)
      onCatalogChanged()
      setReload((value) => value + 1)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể lưu sản phẩm'
      setFormError(msg)
      showToast(msg, 'warning')
    } finally {
      setSavingForm(false)
    }
  }

  const handleUpdateOrder = async (orderCode: string, payload: { status?: string; payment_status?: string }) => {
    if (busyId !== null) return
    setBusyId(orderCode)
    try {
      const res = await api.admin.updateOrder(orderCode, payload)
      setOrders((prev) => prev.map((o) => (o.order_code === orderCode ? res.order : o)))
      setReload((value) => value + 1)
      if (payload.status === 'Đã hủy' || res.order.status !== 'Đã hủy') {
        onCatalogChanged()
      }
      showToast(`Đã cập nhật đơn ${orderCode}`, 'success')
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Không thể cập nhật đơn hàng', 'warning')
    } finally {
      setBusyId(null)
    }
  }

  const stockBadgeClass = (stock: number) => {
    if (stock <= 0) return 'admin-stock-badge out'
    if (stock <= 5) return 'admin-stock-badge low'
    return 'admin-stock-badge ok'
  }

  const orderBadgeClass = (status: string) => {
    const s = status.toLowerCase()
    if (s.includes('hủy')) return 'order-status-badge cancelled'
    if (s.includes('thành công')) return 'order-status-badge success'
    if (s.includes('đang giao')) return 'order-status-badge shipping'
    if (s.includes('xác nhận')) return 'order-status-badge confirmed'
    return 'order-status-badge pending'
  }

  if (sessionLoading) {
    return <div className="admin-gate-page"><div className="admin-gate-card" role="status">Đang kiểm tra phiên đăng nhập…</div></div>
  }

  if (!isStaff) {
    return (
      <div className="admin-gate-page">
        <div className="admin-gate-card">
          <div className="admin-gate-icon">
            {user ? <ShieldAlert size={30} /> : <ShieldCheck size={30} />}
          </div>
          <h1>Quản trị CloudPhone</h1>
          {user ? (
            <p>
              Tài khoản <strong>{user.username}</strong> chưa có quyền quản lý kho và đơn hàng.
            </p>
          ) : (
            <p>
              Vui lòng đăng nhập bằng tài khoản nhân viên hoặc quản trị viên để truy cập kho hàng và xử lý đơn đặt.
            </p>
          )}
          <div className="admin-gate-actions">
            {user ? (
              <button type="button" className="btn-admin-primary" onClick={onLogout}>
                <LogOut size={16} />
                <span>Đăng xuất đổi tài khoản</span>
              </button>
            ) : (
              <button type="button" className="btn-admin-primary" onClick={onOpenAuth}>
                <UserIcon size={16} />
                <span>Đăng nhập nhân viên</span>
              </button>
            )}
            <button type="button" className="btn-admin-secondary" onClick={onBackToStore}>
              <ArrowLeft size={16} />
              <span>Quay lại cửa hàng</span>
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page-shell">
      <aside className="admin-sidebar" aria-label="Điều hướng quản trị">
        <div className="admin-brand">
          <span className="admin-brand-icon"><Smartphone size={21} /></span>
          <div><strong>CloudPhone</strong><span>Quản trị cửa hàng</span></div>
        </div>

        <nav className="admin-nav">
          <button type="button" className="admin-nav-item" aria-current={tab === 'inventory' ? 'page' : undefined} onClick={() => switchTab('inventory')}>
            <Package size={18} /> <span>Kho hàng</span>
          </button>
          <button type="button" className="admin-nav-item" aria-current={tab === 'orders' ? 'page' : undefined} onClick={() => switchTab('orders')}>
            <Truck size={18} /> <span>Đơn hàng</span>
            {!!overview?.orders.pending_orders && <b>{overview.orders.pending_orders}</b>}
          </button>
          <button type="button" className="admin-nav-item" aria-current={tab === 'traffic' ? 'page' : undefined} onClick={() => switchTab('traffic')}>
            <BarChart3 size={18} /> <span>Lưu lượng truy cập</span>
          </button>
        </nav>

        <div className="admin-sidebar-footer">
          <button type="button" className="admin-nav-item" onClick={onBackToStore}>
            <ArrowLeft size={17} /> <span>Về cửa hàng</span>
          </button>
          <div className="admin-account">
            <span className="admin-avatar"><UserIcon size={18} /></span>
            <div><strong>{user.username}</strong><span>{user.role === 'admin' ? 'Quản trị viên' : 'Nhân viên'}</span></div>
            <button type="button" className="admin-signout" onClick={onLogout} aria-label="Đăng xuất" title="Đăng xuất">
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-main-content">
        <header className="admin-topbar">
          <div>
            <h1>
              {tab === 'inventory'
                ? 'Quản lý kho hàng'
                : tab === 'orders'
                ? 'Quản lý đơn hàng'
                : 'Thống kê lưu lượng truy cập'}
            </h1>
            <p>
              {tab === 'inventory'
                ? 'Theo dõi tồn kho, giá bán và thông tin điện thoại.'
                : tab === 'orders'
                ? 'Theo dõi và xử lý các đơn đặt từ cửa hàng.'
                : 'Số liệu truy cập, khách hàng và hành vi tương tác thực tế tại cửa hàng.'}
            </p>
          </div>
          <div className="admin-topbar-actions">
            {overview?.can_sync_vectors && (
              <button type="button" className="btn-admin-secondary" onClick={handleSync} disabled={syncing}>
                <Database size={16} /> {syncing ? 'Đang đồng bộ…' : 'Đồng bộ BIX'}
              </button>
            )}
            <button type="button" className="btn-admin-secondary" onClick={loadAll} disabled={loading}>
              <RefreshCw size={16} className={loading ? 'spin-icon' : ''} /> Làm mới
            </button>
            {tab === 'inventory' && (
              <button type="button" className="btn-admin-primary" onClick={openCreateModal}>
                <PackagePlus size={17} /> Thêm sản phẩm
              </button>
            )}
          </div>
        </header>

        {tab !== 'traffic' && (
        <section className="admin-kpi-grid" aria-label="Tổng quan cửa hàng" aria-busy={loading}>
          <article className="admin-kpi-card">
            <div className="admin-kpi-label"><span className="kpi-icon blue"><Boxes size={18} /></span> Tổng tồn kho</div>
            <strong>{overview ? overview.products.total_stock.toLocaleString('vi-VN') : '—'}</strong>
            <span>{overview ? overview.products.total_products + ' mẫu điện thoại' : 'Máy trong kho'}</span>
          </article>
          <article className="admin-kpi-card">
            <div className="admin-kpi-label"><span className="kpi-icon amber"><ShieldAlert size={18} /></span> Cảnh báo kho</div>
            <strong>{overview ? overview.products.low_stock_count + overview.products.out_of_stock_count : '—'}</strong>
            <span>{overview ? overview.products.low_stock_count + ' sắp hết · ' + overview.products.out_of_stock_count + ' hết hàng' : 'Mẫu còn tối đa 5 máy'}</span>
          </article>
          <article className="admin-kpi-card">
            <div className="admin-kpi-label"><span className="kpi-icon purple"><ClipboardList size={18} /></span> Đơn cần xử lý</div>
            <strong>{overview ? overview.orders.pending_orders : '—'}</strong>
            <span>{overview ? overview.orders.shipping_orders + ' đang giao · ' + overview.orders.total_orders + ' tổng đơn' : 'Đang xử lý hoặc đã xác nhận'}</span>
          </article>
          <article className="admin-kpi-card">
            <div className="admin-kpi-label"><span className="kpi-icon green"><Wallet size={18} /></span> Doanh thu đã thu</div>
            <strong>{overview ? vnd(overview.orders.total_revenue) : '—'}</strong>
            <span>{overview ? overview.orders.completed_orders + ' đơn giao thành công' : 'Tổng tiền đã thanh toán'}</span>
          </article>
        </section>
        )}

        {loadError && <p className="admin-load-error" role="alert">{loadError} <button type="button" onClick={loadAll}>Thử lại</button></p>}

        {/* TAB 1: INVENTORY MANAGEMENT */}
        {tab === 'inventory' && (
          <section className="admin-panel-card" aria-labelledby="inventory-title" aria-busy={loading}>
            <div className="admin-panel-heading">
              <h2 id="inventory-title">Danh sách sản phẩm</h2>
              <span>{products.length} kết quả</span>
            </div>
            <div className="admin-toolbar">
              <div className="admin-search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Tên máy, chip hoặc nhãn"
                  aria-label="Tìm sản phẩm"
                  value={prodQuery}
                  onChange={(e) => setProdQuery(e.target.value)}
                />
              </div>

              <select
                className="admin-select"
                value={prodBrand}
                onChange={(e) => setProdBrand(e.target.value)}
                aria-label="Lọc theo hãng"
              >
                {BRANDS.map((b) => (
                  <option key={b} value={b}>{b === 'All' ? 'Tất cả hãng' : b}</option>
                ))}
              </select>

              <div className="admin-filter-pills">
                <button
                  type="button"
                  className={`admin-pill ${stockFilter === 'all' ? 'active' : ''}`}
                  aria-pressed={stockFilter === 'all'}
                  onClick={() => setStockFilter('all')}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  className={`admin-pill ${stockFilter === 'low' ? 'active' : ''}`}
                  aria-pressed={stockFilter === 'low'}
                  onClick={() => setStockFilter('low')}
                >
                  Sắp hết (≤ 5)
                </button>
                <button
                  type="button"
                  className={`admin-pill ${stockFilter === 'out' ? 'active' : ''}`}
                  aria-pressed={stockFilter === 'out'}
                  onClick={() => setStockFilter('out')}
                >
                  Hết hàng
                </button>
              </div>
            </div>

            <div className="admin-table-wrap" tabIndex={0} aria-label="Bảng tồn kho, có thể cuộn ngang">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Sản phẩm</th>
                    <th>Hãng / Nhãn</th>
                    <th>Giá bán</th>
                    <th>Tồn kho</th>
                    <th>Điều chỉnh nhanh</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="admin-empty-cell">
                        {loading ? 'Đang tải sản phẩm…' : !loadError && 'Không có sản phẩm nào khớp bộ lọc.'}
                      </td>
                    </tr>
                  ) : (
                    products.map((p) => {
                      const stock = p.stock ?? 0
                      const draftVal = stockDrafts[p.id] ?? String(stock)
                      const parsedDraft = Number(draftVal)
                      const draftChanged = draftVal.trim() !== '' && Number.isInteger(parsedDraft) && parsedDraft >= 0 && parsedDraft !== stock
                      return (
                        <tr key={p.id}>
                          <td>
                            <div className="admin-prod-cell">
                              <img src={p.image} alt="" className="admin-prod-thumb" loading="lazy" onError={showProductPlaceholder} />
                              <div>
                                <strong>{p.name}</strong>
                                <span className="admin-prod-meta">{p.ram_rom} • {p.chip}</span>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className="admin-brand-chip">{p.brand}</span>
                            {p.tag && <span className="admin-tag-chip">{p.tag}</span>}
                          </td>
                          <td>
                            <strong className="admin-price-main">{vnd(p.price)}</strong>
                            {p.original_price && (
                              <span className="admin-price-old">{vnd(p.original_price)}</span>
                            )}
                          </td>
                          <td>
                            <span className={stockBadgeClass(stock)}>
                              {stock <= 0 ? 'Hết hàng (0)' : stock <= 5 ? `Sắp hết (${stock})` : `${stock} máy`}
                            </span>
                          </td>
                          <td>
                            <div className="admin-stock-controls">
                              <button
                                type="button"
                                className="btn-stock-step"
                                disabled={busyId !== null || stock <= 0}
                                onClick={() => handleAdjustStock(p, { delta: -1 })}
                                title="Giảm 1"
                              >
                                -1
                              </button>
                              <input
                                type="number"
                                min={0}
                                max={9999}
                                className="admin-stock-input"
                                value={draftVal}
                                onChange={(e) => setStockDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                                aria-label={`Số lượng tồn kho ${p.name}`}
                              />
                              <button
                                type="button"
                                className="btn-stock-step"
                                disabled={busyId !== null}
                                onClick={() => handleAdjustStock(p, { delta: 1 })}
                                title="Tăng 1"
                              >
                                +1
                              </button>
                              <button
                                type="button"
                                className="btn-stock-step plus"
                                disabled={busyId !== null}
                                onClick={() => handleAdjustStock(p, { delta: 5 })}
                                title="Nhập thêm 5 máy"
                              >
                                +5
                              </button>
                              <button
                                type="button"
                                className="btn-stock-step plus"
                                disabled={busyId !== null}
                                onClick={() => handleAdjustStock(p, { delta: 10 })}
                                title="Nhập thêm 10 máy"
                              >
                                +10
                              </button>
                              {draftChanged && (
                                <button
                                  type="button"
                                  className="btn-stock-save"
                                  disabled={busyId !== null}
                                  onClick={() => handleAdjustStock(p, { stock: parsedDraft })}
                                >
                                  Lưu
                                </button>
                              )}
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-admin-edit"
                              onClick={() => openEditModal(p)}
                            >
                              <Edit3 size={14} />
                              <span>Sửa</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* TAB 2: ORDER MANAGEMENT */}
        {tab === 'orders' && (
          <section className="admin-panel-card" aria-labelledby="orders-title" aria-busy={loading}>
            <div className="admin-panel-heading">
              <h2 id="orders-title">Danh sách đơn hàng</h2>
              <span>{orders.length} kết quả</span>
            </div>
            <div className="admin-toolbar">
              <div className="admin-search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Mã đơn, tên khách hoặc số điện thoại"
                  aria-label="Tìm đơn hàng"
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                />
              </div>

              <div className="admin-filter-pills">
                <button
                  type="button"
                  className={`admin-pill ${orderStatus === 'all' ? 'active' : ''}`}
                  aria-pressed={orderStatus === 'all'}
                  onClick={() => setOrderStatus('all')}
                >
                  Tất cả
                </button>
                {ORDER_STATUSES.map((st) => (
                  <button
                    key={st}
                    type="button"
                    className={`admin-pill ${orderStatus === st ? 'active' : ''}`}
                    aria-pressed={orderStatus === st}
                    onClick={() => setOrderStatus(st)}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>

            {orders.length === 0 ? (
              <div className="admin-empty-cell">{loading ? 'Đang tải đơn hàng…' : !loadError && 'Chưa có đơn hàng nào khớp điều kiện.'}</div>
            ) : (
              <div className="admin-orders-list">
                {orders.map((ord) => {
                  const nextAction = NEXT_STATUS_ACTION[ord.status]
                  return (
                    <article key={ord.order_code} className="admin-order-card">
                      <div className="admin-order-head">
                        <div className="admin-order-id-group">
                          <strong className="admin-order-code">{ord.order_code}</strong>
                          <span className={orderBadgeClass(ord.status)}>{ord.status}</span>
                          <span className={`admin-pay-badge ${ord.payment_status === 'Đã thanh toán' ? 'paid' : 'unpaid'}`}>
                            {ord.payment_status}
                          </span>
                        </div>
                        <div className="admin-order-meta-right">
                          <strong className="admin-order-total">{vnd(ord.total_amount)}</strong>
                          {ord.created_at && (
                            <span className="admin-order-time">
                              {new Date(ord.created_at.replace(' ', 'T') + (ord.created_at.includes('T') ? '' : 'Z')).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="admin-order-body">
                        <div className="admin-order-customer">
                          <p><strong>Khách nhận:</strong> {ord.customer_name} • {ord.phone}</p>
                          <p><strong>Địa chỉ:</strong> {ord.address}, {ord.city}</p>
                          <p><strong>Thanh toán:</strong> {ord.payment_method}</p>
                          {ord.note && <p className="admin-order-note"><strong>Ghi chú:</strong> {ord.note}</p>}
                        </div>

                        <div className="admin-order-items">
                          {ord.items.map((item, idx) => (
                            <div key={idx} className="admin-order-item-line">
                              <span>{item.name} × {item.qty}</span>
                              <span>{vnd(item.price * item.qty)}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="admin-order-actions">
                        {nextAction && (
                          <button
                            type="button"
                            className="btn-admin-primary"
                            disabled={busyId !== null}
                            onClick={() => handleUpdateOrder(ord.order_code, { status: nextAction.next })}
                          >
                            <Check size={15} />
                            <span>{nextAction.label}</span>
                          </button>
                        )}

                        {ord.payment_status !== 'Đã thanh toán' && ord.status !== 'Đã hủy' && (
                          <button
                            type="button"
                            className="btn-admin-secondary"
                            disabled={busyId !== null}
                            onClick={() => handleUpdateOrder(ord.order_code, { payment_status: 'Đã thanh toán' })}
                          >
                            <CheckCircle2 size={15} />
                            <span>Xác nhận đã thu tiền</span>
                          </button>
                        )}

                        <div className="admin-order-select-wrap">
                          <label htmlFor={`status-${ord.order_code}`}>Đổi trạng thái:</label>
                          <select
                            id={`status-${ord.order_code}`}
                            className="admin-select"
                            value={ord.status}
                            disabled={busyId !== null}
                            onChange={(e) => handleUpdateOrder(ord.order_code, { status: e.target.value })}
                          >
                            {ORDER_STATUSES.map((st) => (
                              <option key={st} value={st}>{st}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>
        )}

        {/* TAB 3: DEDICATED TRAFFIC ANALYTICS PAGE */}
        {tab === 'traffic' && (
          <TrafficAnalyticsView
            report={trafficReport}
            days={trafficDays}
            loading={loading}
            onChangeDays={(d) => setTrafficDays(d)}
          />
        )}
      </main>

      {/* CREATE / EDIT PRODUCT MODAL */}
      {isFormOpen && (
        <dialog
          ref={productDialog}
          className="admin-form-modal"
          aria-labelledby="admin-product-form-title"
          onCancel={(event) => { event.preventDefault(); if (!savingForm) setIsFormOpen(false) }}
        >
            <div className="admin-form-header">
              <h2 id="admin-product-form-title">{editingProduct ? `Chỉnh sửa: ${editingProduct.name}` : 'Thêm sản phẩm mới vào kho'}</h2>
              <button
                type="button"
                className="admin-signout"
                onClick={() => setIsFormOpen(false)}
                disabled={savingForm}
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>

            <form className="admin-product-form" onSubmit={handleSaveProduct}>
              {formError && <p className="admin-load-error" style={{ margin: '12px 16px 0' }} role="alert">{formError}</p>}
              <div className="admin-form-grid">
                <div className="form-field-box full-width">
                  <label htmlFor="prodName">Tên điện thoại *</label>
                  <input
                    id="prodName"
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Ví dụ: Samsung Galaxy A55 5G"
                    autoFocus
                  />
                </div>

                <div className="form-field-box">
                  <label htmlFor="prodBrand">Hãng sản xuất *</label>
                  <select
                    id="prodBrand"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  >
                    {BRANDS.filter((b) => b !== 'All').map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field-box">
                  <label htmlFor="prodTag">Nhãn nổi bật</label>
                  <input
                    id="prodTag"
                    type="text"
                    value={form.tag || ''}
                    onChange={(e) => setForm({ ...form, tag: e.target.value })}
                    placeholder="FLAGSHIP 2026, HOT, MỚI..."
                  />
                </div>

                <div className="form-field-box">
                  <label htmlFor="prodPrice">Giá bán (VNĐ) *</label>
                  <input
                    id="prodPrice"
                    type="number"
                    min={0}
                    required
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
                  />
                </div>

                <div className="form-field-box">
                  <label htmlFor="prodOrigPrice">Giá niêm yết (tùy chọn)</label>
                  <input
                    id="prodOrigPrice"
                    type="number"
                    min={0}
                    value={form.original_price ?? ''}
                    onChange={(e) => setForm({ ...form, original_price: e.target.value ? Number(e.target.value) : null })}
                  />
                </div>

                <div className="form-field-box">
                  <label htmlFor="prodStock">Số lượng tồn kho *</label>
                  <input
                    id="prodStock"
                    type="number"
                    min={0}
                    required
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                  />
                </div>

                <div className="form-field-box">
                  <label htmlFor="prodRam">RAM / Bộ nhớ</label>
                  <input
                    id="prodRam"
                    type="text"
                    value={form.ram_rom || ''}
                    onChange={(e) => setForm({ ...form, ram_rom: e.target.value })}
                  />
                </div>

                <div className="form-field-box">
                  <label htmlFor="prodChip">Vi xử lý (Chip)</label>
                  <input
                    id="prodChip"
                    type="text"
                    value={form.chip || ''}
                    onChange={(e) => setForm({ ...form, chip: e.target.value })}
                  />
                </div>

                <div className="form-field-box">
                  <label htmlFor="prodScreen">Màn hình</label>
                  <input
                    id="prodScreen"
                    type="text"
                    value={form.screen || ''}
                    onChange={(e) => setForm({ ...form, screen: e.target.value })}
                  />
                </div>

                <div className="form-field-box">
                  <label htmlFor="prodBattery">Pin &amp; Sạc</label>
                  <input
                    id="prodBattery"
                    type="text"
                    value={form.battery || ''}
                    onChange={(e) => setForm({ ...form, battery: e.target.value })}
                  />
                </div>

                <div className="form-field-box">
                  <label htmlFor="prodCamera">Camera</label>
                  <input
                    id="prodCamera"
                    type="text"
                    value={form.camera || ''}
                    onChange={(e) => setForm({ ...form, camera: e.target.value })}
                  />
                </div>

                <div className="form-field-box full-width">
                  <label htmlFor="prodImg">Đường dẫn hình ảnh</label>
                  <input
                    id="prodImg"
                    type="text"
                    value={form.image || ''}
                    onChange={(e) => setForm({ ...form, image: e.target.value })}
                  />
                </div>

                <div className="form-field-box full-width">
                  <label htmlFor="prodDesc">Mô tả ngắn</label>
                  <textarea
                    id="prodDesc"
                    rows={3}
                    value={form.description || ''}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="admin-form-footer">
                <button
                  type="button"
                  className="btn-admin-secondary"
                  onClick={() => setIsFormOpen(false)}
                  disabled={savingForm}
                >
                  Hủy
                </button>
                <button type="submit" className="btn-admin-primary" disabled={savingForm}>
                  <Plus size={16} />
                  <span>{savingForm ? 'Đang lưu...' : editingProduct ? 'Lưu thay đổi' : 'Thêm vào kho'}</span>
                </button>
              </div>
            </form>
        </dialog>
      )}
    </div>
  )
}
