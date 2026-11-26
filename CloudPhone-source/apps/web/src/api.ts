export type Product = {
  id: number
  name: string
  brand: string
  price: number
  original_price: number | null
  image: string
  chip: string
  screen: string
  ram_rom: string
  battery: string
  camera?: string
  stock?: number
  rating: number
  tag: string
  description: string
}

export type Policy = {
  id: number
  title: string
  slug: string
  category: string
  content: string
}

export type Variant = {
  variant_id: string
  product_id: number
  storage: string
  price: number
  original_price: number | null
  is_default: number
}

export type CheckoutOptions = { coupon_code?: string; vip_care?: boolean }

export type CartItem = {
  variant_id: string
  product: Product
  qty: number
}

export type Cart = {
  items: CartItem[]
  total: number
  count: number
  qr_available?: boolean
}

export type User = {
  id: number
  username: string
  phone: string
  role?: string
}

export type OrderItem = {
  variant_id?: string
  id: number
  name: string
  price: number
  qty: number
  image?: string
}

export type AdminOverview = {
  ok: boolean
  can_sync_vectors: boolean
  products: {
    total_products: number
    total_stock: number
    low_stock_count: number
    out_of_stock_count: number
  }
  orders: {
    total_orders: number
    pending_orders: number
    shipping_orders: number
    completed_orders: number
    total_revenue: number
  }
}

export type AdminTrafficDay = {
  day: string
  label: string
  page_views: number
  visitors: number
  interactions: number
  add_to_cart: number
  checkouts: number
}

export type AdminTrafficEvent = {
  event: string
  label: string
  total: number
  today: number
}

export type AdminTrafficReport = {
  ok: boolean
  days: number
  summary: {
    today_views: number
    total_views: number
    today_visitors: number
    total_visitors: number
    today_interactions: number
    total_checkouts: number
  }
  daily: AdminTrafficDay[]
  events: AdminTrafficEvent[]
}

export type AdminProductInput = {
  name: string
  brand: string
  price: number
  original_price?: number | null
  stock: number
  image?: string
  chip?: string
  screen?: string
  ram_rom?: string
  battery?: string
  camera?: string
  tag?: string
  description?: string
}

export type Order = {
  id?: number
  order_code: string
  phone: string
  customer_name: string
  address: string
  city: string
  payment_method: string
  payment_status: string
  note: string
  qr_url: string | null
  total_amount: number
  status: string
  created_at?: string
  items: OrderItem[]
}

export type ChatMessage = {
  id: string
  sender: 'user' | 'bot'
  text: string
  time: string
  suggestions?: string[]
  products?: Product[]
}

export const cartId = (() => {
  try {
    let id = localStorage.getItem('cloudphone_cart_id')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('cloudphone_cart_id', id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
})()

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const customHeaders: Record<string, string> = {
    'content-type': 'application/json',
    'x-cart-id': cartId,
  }

  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      ...customHeaders,
      ...(init.headers || {}),
    },
  })
  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}))
    throw new Error(errorBody.error || `${res.status} ${res.statusText}`)
  }
  return res.json()
}

export const api = {
  products: async (params?: { brand?: string; q?: string }, signal?: AbortSignal) => {
    const query = new URLSearchParams()
    if (params?.brand && params.brand !== 'All') query.set('brand', params.brand)
    if (params?.q) query.set('q', params.q)
    const qs = query.toString()

    // Luôn gọi API mới nhất để đảm bảo dữ liệu và hình ảnh sản phẩm luôn cập nhật tức thì
    const data = await req<Product[]>(`/products${qs ? `?${qs}` : ''}`, { signal })
    return data
  },
  policies: () => req<Policy[]>('/policies'),
  cart: () => req<Cart>('/cart'),
  variants: (productId: number) => req<Variant[]>(`/products/${productId}/variants`),
  add: (productId: number, variant_id?: string) =>
    req<Cart>('/cart/items', { method: 'POST', body: JSON.stringify({ productId, variant_id }) }),
  setQty: (variantId: string, qty: number) =>
    req<Cart>(`/cart/items/${encodeURIComponent(variantId)}`, { method: 'PUT', body: JSON.stringify({ qty }) }),
  clear: () => req<Cart>('/cart', { method: 'DELETE' }),
  chat: (message: string) =>
    req<{ reply: string; suggestions?: string[]; products?: Product[] }>('/chat', {
      method: 'POST',
      body: JSON.stringify({ message }),
    }),
  auth: {
    register: (data: { username: string; phone: string; password: string }) =>
      req<{ user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    login: (data: { username: string; password: string }) =>
      req<{ user: User }>('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
    me: () => req<{ user: User }>('/auth/me'),
    logout: () => req<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
  },
  orders: {
    create: (data: CheckoutOptions & {
      request_id: string; phone: string; customer_name: string; address: string; city: string
      note: string; payment_method: 'cod' | 'qr'; expected_total: number
      expected_items: Pick<CartItem, 'variant_id' | 'qty'>[]
    }) => req<{ ok: boolean; order: Order }>('/orders', { method: 'POST', body: JSON.stringify(data) }),
    lookup: (order_code?: string) =>
      req<{ ok: boolean; order?: Order; orders: Order[] }>('/orders/lookup', {
        method: 'POST', body: JSON.stringify({ order_code }),
      }),
  },
  admin: {
    overview: () => req<AdminOverview>('/admin/overview'),
    traffic: (days = 14) => req<AdminTrafficReport>(`/admin/traffic?days=${days}`),
    syncVectors: () => req<{ total_synced?: number }>('/admin/sync-vectors', { method: 'POST' }),
    products: (params?: { brand?: string; q?: string; stock_filter?: string }) => {
      const query = new URLSearchParams()
      if (params?.brand && params.brand !== 'All') query.set('brand', params.brand)
      if (params?.q) query.set('q', params.q)
      if (params?.stock_filter && params.stock_filter !== 'all') query.set('stock_filter', params.stock_filter)
      const qs = query.toString()
      return req<{ ok: boolean; products: Product[] }>(`/admin/products${qs ? `?${qs}` : ''}`)
    },
    createProduct: (data: AdminProductInput) =>
      req<{ ok: boolean; product: Product }>('/admin/products', { method: 'POST', body: JSON.stringify(data) }),
    updateProduct: (id: number, data: Partial<AdminProductInput>) =>
      req<{ ok: boolean; product: Product }>(`/admin/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    adjustStock: (id: number, payload: { stock?: number; delta?: number }) =>
      req<{ ok: boolean; product: Product }>(`/admin/products/${id}/stock`, { method: 'PATCH', body: JSON.stringify(payload) }),
    orders: (params?: { status?: string; q?: string }) => {
      const query = new URLSearchParams()
      if (params?.status && params.status !== 'all') query.set('status', params.status)
      if (params?.q) query.set('q', params.q)
      const qs = query.toString()
      return req<{ ok: boolean; orders: Order[] }>(`/admin/orders${qs ? `?${qs}` : ''}`)
    },
    updateOrder: (orderCode: string, payload: { status?: string; payment_status?: string }) =>
      req<{ ok: boolean; order: Order }>(`/admin/orders/${encodeURIComponent(orderCode)}`, {
        method: 'PATCH', body: JSON.stringify(payload),
      }),
  },
}

export const vnd = (n: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(n)

export const formatCompactVnd = (n: number) => {
  if (n >= 1_000_000) {
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)} triệu`
  }
  return `${(n / 1000).toFixed(0)}k`
}
