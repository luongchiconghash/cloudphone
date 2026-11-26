import { Hono } from 'hono'
import type { Context } from 'hono'
import { endSession, hashPassword, sessionUserId, startSession, verifyPassword } from './auth'
import { extractIntent, scoreAndRankProducts, generateAdvice } from './advisor'

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
  camera: string
  stock: number
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

export type User = {
  id: number
  username: string
  phone: string
  role: string
  created_at: string
}

type Env = {
  Bindings: {
    DB: D1Database
    CART?: KVNamespace
    AI?: Ai
    VECTORIZE?: VectorizeIndex
    BASIN_ENDPOINT?: string
    BASIN_GROUP_ID?: string
    VIETQR_BANK_BIN?: string
    VIETQR_ACCOUNT_NUMBER?: string
  }
}

type Variant = {
  variant_id: string
  product_id: number
  storage: string
  price: number
  original_price: number | null
  is_default: number
}

const app = new Hono<Env>().basePath('/api')

const CLIENT_ANALYTICS_EVENTS = new Set(['page_view', 'view_product', 'filter_brand', 'search', 'compare_products', 'chat_ai', 'order_lookup'])

function vnToday(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
}

function trackEvent(c: Context<Env>, event: string, details: Record<string, string | number> = {}) {
  const day = vnToday()
  const visitorId = cartKey(c) ?? 'anon'
  const tasks: Promise<unknown>[] = [
    c.env.DB.batch([
      c.env.DB.prepare(`
        INSERT INTO traffic_daily (day, event, count) VALUES (?, ?, 1)
        ON CONFLICT(day, event) DO UPDATE SET count = count + 1
      `).bind(day, event),
      ...(event === 'page_view'
        ? [c.env.DB.prepare('INSERT OR IGNORE INTO traffic_visitors (day, visitor_id) VALUES (?, ?)').bind(day, visitorId)]
        : []),
    ]).catch((err) => console.warn('D1 traffic tracking skipped', err)),
  ]

  const { BASIN_ENDPOINT: endpoint, BASIN_GROUP_ID: group } = c.env
  if (endpoint && group) {
    const cf = c.req.raw.cf
    tasks.push(Promise.resolve().then(() => fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: group,
        country: cf?.country ?? null,
        time: Date.now(),
        meta: { event, ...details },
      }),
      signal: AbortSignal.timeout(5_000),
    })).then(async (response) => {
      await response.body?.cancel()
      if (!response.ok) console.warn('Basin rejected analytics event', response.status)
    }).catch(() => console.warn('Basin analytics unavailable')))
  }
  c.executionCtx.waitUntil(Promise.allSettled(tasks))
}

app.post('/analytics', async (c) => {
  const event = (await parseBody(c))?.event
  if (typeof event !== 'string' || !CLIENT_ANALYTICS_EVENTS.has(event)) {
    return c.json({ error: 'Sự kiện không hợp lệ' }, 400)
  }
  trackEvent(c, event)
  return c.body(null, 204)
})

function formatVndPrice(price: number): string {
  if (price >= 1_000_000) {
    const m = price / 1_000_000
    return `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)} triệu`
  }
  return `${(price / 1_000).toFixed(0)}k`
}

// Đồng bộ toàn bộ sản phẩm và chính sách vào Cloudflare Vectorize bằng model BGE-M3
async function syncVectorStore(env: Env['Bindings'], ai: Ai, vectorize: VectorizeIndex) {
  const { results: products } = await env.DB.prepare('SELECT * FROM products ORDER BY id ASC').all<Product>()
  const { results: policies } = await env.DB.prepare('SELECT * FROM policies ORDER BY id ASC').all<Policy>()

  const items: { id: string; text: string; metadata: Record<string, string | number> }[] = []

  for (const p of products) {
    const text = `Sản phẩm ${p.name} thương hiệu ${p.brand}, giá bán ${p.price} VNĐ (${formatVndPrice(p.price)}). ` +
      `Trang bị chip ${p.chip}, màn hình ${p.screen}, RAM và bộ nhớ trong ${p.ram_rom}, dung lượng pin ${p.battery}. ` +
      `Hệ thống camera: ${p.camera || 'Chất lượng cao'}. Tình trạng kho: ${p.stock} máy sẵn có. ` +
      `Đặc điểm: ${p.description}. Nhãn: ${p.tag}. Đánh giá: ${p.rating} sao.`
    items.push({
      id: `prod_${p.id}`,
      text,
      metadata: { type: 'product', productId: p.id, name: p.name, brand: p.brand, price: p.price },
    })
  }

  for (const pol of policies) {
    const text = `Chính sách ${pol.title} (${pol.category}): ${pol.content}`
    items.push({
      id: `policy_${pol.id}`,
      text,
      metadata: { type: 'policy', policyId: pol.id, title: pol.title, category: pol.category },
    })
  }

  if (items.length === 0) {
    return { ok: true, synced: 0 }
  }

  const BATCH_SIZE = 10
  const vectors: VectorizeVector[] = []

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE)
    const texts = chunk.map((c) => c.text)

    const embedRes = (await ai.run('@cf/baai/bge-m3', { text: texts })) as { data?: number[][] }
    const embeddings = embedRes.data || []

    for (let j = 0; j < chunk.length; j++) {
      if (embeddings[j] && embeddings[j].length > 0) {
        vectors.push({
          id: chunk[j].id,
          values: embeddings[j],
          metadata: chunk[j].metadata,
        })
      }
    }
  }

  if (vectors.length > 0) {
    await vectorize.upsert(vectors)
  }

  return {
    ok: true,
    message: 'Đã đồng bộ toàn bộ dữ liệu vào Cloudflare Vectorize thành công!',
    total_synced: vectors.length,
    products_count: products.length,
    policies_count: policies.length,
    embedding_model: '@cf/baai/bge-m3',
  }
}

const cartKey = (c: Context<Env>) => {
  const id = c.req.header('x-cart-id')
  return id && /^[\w-]{8,64}$/.test(id) ? 'cart:' + id : null
}

function qrAccount(env: Env['Bindings']): string | null {
  const { VIETQR_BANK_BIN: bank, VIETQR_ACCOUNT_NUMBER: account } = env
  return bank && account && /^\d{6}$/.test(bank) && /^\d{6,20}$/.test(account) ? bank + '-' + account : null
}

async function ensureCart(c: Context<Env>, key: string) {
  const { DB, CART } = c.env
  if (!CART) return
  if (await DB.prepare('SELECT 1 FROM cart_migrations WHERE cart_key = ?').bind(key).first()) return
  const old = await CART.get<{ productId: number; storage?: string; qty: number }[]>(key, 'json')
  const lines = Array.isArray(old) ? old.filter((l) => Number.isSafeInteger(l?.productId) && Number.isSafeInteger(l.qty) && l.qty > 0) : []
  await DB.batch([
    ...lines.slice(0, 50).map((line) => DB.prepare(`
      INSERT INTO cart_lines (cart_key, variant_id, qty)
      SELECT ?, variant_id, ?
      FROM product_variants
      WHERE product_id = ? AND (storage = ? OR is_default = 1)
        AND NOT EXISTS (SELECT 1 FROM cart_migrations WHERE cart_key = ?)
      ORDER BY (storage = ?) DESC, is_default DESC, variant_id LIMIT 1
      ON CONFLICT(cart_key, variant_id) DO UPDATE SET qty = min(99, cart_lines.qty + excluded.qty)
    `).bind(key, Math.min(line.qty, 99), line.productId, line.storage ?? null, key, line.storage ?? null)),
    DB.prepare('INSERT OR IGNORE INTO cart_migrations (cart_key) VALUES (?)').bind(key),
  ])
}

async function readCart(c: Context<Env>, key: string) {
  const { results } = await c.env.DB.prepare(`
    SELECT p.*, v.variant_id, v.storage,
           v.price AS variant_price, v.original_price AS variant_original_price, line.qty
    FROM cart_lines line JOIN product_variants v ON v.variant_id = line.variant_id
    JOIN products p ON p.id = v.product_id
    WHERE line.cart_key = ? ORDER BY p.id, v.variant_id
  `).bind(key).all<Product & {
    variant_id: string; storage: string
    variant_price: number; variant_original_price: number | null; qty: number
  }>()
  const items = results.map(({ variant_id, storage, variant_price, variant_original_price, qty, ...p }) => ({
    variant_id, qty,
    product: {
      ...p, name: p.name.replace(/(?:\d+GB\/)?(?:128GB|256GB|512GB|1TB)\b/gi, '').trim() + ' ' + storage,
      price: variant_price, original_price: variant_original_price,
    },
  }))
  return {
    items, total: items.reduce((sum, i) => sum + i.product.price * i.qty, 0),
    count: items.reduce((sum, i) => sum + i.qty, 0), qr_available: !!qrAccount(c.env),
  }
}

const parseBody = (c: Context<Env>) => c.req.json<Record<string, unknown>>().catch(() => null)
const boundedText = (value: unknown, max: number) => typeof value === 'string' && value.trim().length <= max ? value.trim() : ''
const normalizedPhone = (value: unknown) => {
  const phone = boundedText(value, 25).replace(/[\s.-]/g, '').replace(/^\+84/, '0')
  return /^\d{9,11}$/.test(phone) ? phone : ''
}

// Lấy danh sách điện thoại (hỗ trợ lọc theo hãng và tìm kiếm từ khoá)
app.get('/products', async (c) => {
  const brand = c.req.query('brand')
  const q = c.req.query('q')?.trim().toLowerCase()

  let sql = 'SELECT * FROM products'
  const params: unknown[] = []
  const conditions: string[] = []

  if (brand && brand !== 'All') {
    conditions.push('LOWER(brand) = LOWER(?)')
    params.push(brand)
  }
  if (q) {
    conditions.push('(LOWER(name) LIKE ? OR LOWER(chip) LIKE ? OR LOWER(description) LIKE ? OR LOWER(tag) LIKE ? OR LOWER(camera) LIKE ?)')
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`)
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ')
  }
  sql += ' ORDER BY id ASC'

  const stmt = c.env.DB.prepare(sql)
  const { results } = params.length > 0 ? await stmt.bind(...params).all<Product>() : await stmt.all<Product>()
  c.header('Cache-Control', 'no-cache')
  return c.json(results)
})

app.get('/products/:id/variants', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id < 1) return c.json({ error: 'Sản phẩm không hợp lệ' }, 400)
  const { results } = await c.env.DB.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY is_default DESC, variant_id')
    .bind(id).all<Variant>()
  if (!results.length) return c.json({ error: 'Không tìm thấy sản phẩm' }, 404)
  return c.json(results)
})

// Lấy danh sách chính sách bán hàng & hỗ trợ khách hàng
app.get('/policies', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM policies ORDER BY id ASC').all<Policy>()
  c.header('Cache-Control', 'public, max-age=300, s-maxage=600')
  return c.json(results)
})

app.get('/cart', async (c) => {
  const key = cartKey(c)
  if (!key) return c.json({ error: 'Thiếu mã giỏ hàng' }, 400)
  await ensureCart(c, key)
  return c.json(await readCart(c, key))
})

app.post('/cart/items', async (c) => {
  const key = cartKey(c)
  const body = await parseBody(c)
  const productId = body?.productId
  const variantId = boundedText(body?.variant_id, 80)
  if (!key || typeof productId !== 'number' || !Number.isSafeInteger(productId) ||
      (body?.variant_id !== undefined && !variantId)) return c.json({ error: 'Sản phẩm hoặc giỏ hàng không hợp lệ' }, 400)
  const variant = await c.env.DB.prepare(
    'SELECT variant_id FROM product_variants WHERE product_id = ? AND (variant_id = ? OR (? = ? AND is_default = 1))'
  ).bind(productId, variantId, variantId, '').first<Variant>()
  if (!variant) return c.json({ error: 'Không tìm thấy phiên bản sản phẩm' }, 404)
  await ensureCart(c, key)
  const write = await c.env.DB.prepare(`
    INSERT INTO cart_lines (cart_key, variant_id, qty)
    SELECT ?, ?, 1 WHERE (
      SELECT coalesce(sum(l.qty), 0) FROM cart_lines l JOIN product_variants v ON v.variant_id = l.variant_id
      WHERE l.cart_key = ? AND v.product_id = ?
    ) < (SELECT stock FROM products WHERE id = ?)
    AND ((SELECT count(*) FROM cart_lines WHERE cart_key = ?) < 50
       OR EXISTS (SELECT 1 FROM cart_lines WHERE cart_key = ? AND variant_id = ?))
    ON CONFLICT(cart_key, variant_id) DO UPDATE SET qty = qty + 1 WHERE qty < 99
  `).bind(key, variant.variant_id, key, productId, productId, key, key, variant.variant_id).run()
  if (!write.meta.changes) return c.json({ error: 'Đã hết tồn kho hoặc đạt giới hạn giỏ hàng' }, 409)
  trackEvent(c, 'add_to_cart', { product_id: productId })
  return c.json(await readCart(c, key))
})

app.put('/cart/items/:variantId', async (c) => {
  const key = cartKey(c)
  const variantId = boundedText(c.req.param('variantId'), 80)
  const qty = (await parseBody(c))?.qty
  if (!key || !variantId || typeof qty !== 'number' || !Number.isInteger(qty) || qty < 0 || qty > 99) {
    return c.json({ error: 'Phiên bản hoặc số lượng không hợp lệ' }, 400)
  }
  await ensureCart(c, key)
  const { DB } = c.env
  if (qty === 0) {
    await DB.prepare('DELETE FROM cart_lines WHERE cart_key = ? AND variant_id = ?').bind(key, variantId).run()
  } else {
    const write = await DB.prepare(`
      UPDATE cart_lines SET qty = ? WHERE cart_key = ? AND variant_id = ? AND (
        ? <= qty OR ? + (
          SELECT coalesce(sum(other.qty), 0)
          FROM cart_lines other JOIN product_variants v ON v.variant_id = other.variant_id
          WHERE other.cart_key = ? AND other.variant_id <> ?
            AND v.product_id = (SELECT product_id FROM product_variants WHERE variant_id = ?)
        ) <= (SELECT p.stock FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.variant_id = ?)
      )
    `).bind(qty, key, variantId, qty, qty, key, variantId, variantId, variantId).run()
    if (!write.meta.changes) return c.json({ error: 'Phiên bản không còn trong giỏ hoặc không đủ hàng' }, 409)
  }
  return c.json(await readCart(c, key))
})

app.delete('/cart', async (c) => {
  const key = cartKey(c)
  if (!key) return c.json({ error: 'Thiếu mã giỏ hàng' }, 400)
  await ensureCart(c, key)
  await c.env.DB.prepare('DELETE FROM cart_lines WHERE cart_key = ?').bind(key).run()
  return c.json(await readCart(c, key))
})

const USER_COLUMNS = 'id, username, phone, role, created_at'

app.post('/auth/register', async (c) => {
  c.header('Cache-Control', 'no-store')
  const body = await parseBody(c)
  const username = boundedText(body?.username, 64)
  const phone = normalizedPhone(body?.phone)
  const password = body?.password
  if (username.length < 3 || !phone || typeof password !== 'string' || password.length < 6 || password.length > 128) {
    return c.json({ error: 'Nhập tên tài khoản 3–64 ký tự, số điện thoại hợp lệ và mật khẩu 6–128 ký tự.' }, 400)
  }
  const { DB } = c.env
  const user = await DB.prepare(`
    INSERT INTO users (username, phone, password_hash, role)
    SELECT ?, ?, ?, 'customer' WHERE NOT EXISTS (SELECT 1 FROM users WHERE lower(username) = lower(?))
    RETURNING ${USER_COLUMNS}
  `).bind(username, phone, await hashPassword(password), username).first<User>()
  if (!user) return c.json({ error: 'Tên tài khoản đã được sử dụng' }, 409)
  await startSession(c, DB, user.id)
  return c.json({ user }, 201)
})

app.post('/auth/login', async (c) => {
  c.header('Cache-Control', 'no-store')
  const body = await parseBody(c)
  const username = boundedText(body?.username, 64)
  const password = body?.password
  if (!username || typeof password !== 'string' || !password || password.length > 128) {
    return c.json({ error: 'Vui lòng nhập tên tài khoản và mật khẩu hợp lệ' }, 400)
  }
  const { DB } = c.env
  const row = await DB.prepare(`SELECT ${USER_COLUMNS}, password_hash FROM users WHERE lower(username) = lower(?)`)
    .bind(username).first<User & { password_hash: string }>()
  if (!row) return c.json({ error: 'Tên tài khoản hoặc mật khẩu không chính xác' }, 401)
  const { password_hash, ...user } = row
  const result = await verifyPassword(password, password_hash)
  if (!result.valid) return c.json({ error: 'Tên tài khoản hoặc mật khẩu không chính xác' }, 401)
  if (result.legacy) {
    await DB.prepare('UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?')
      .bind(await hashPassword(password), user.id, password_hash).run()
  }
  await startSession(c, DB, user.id)
  return c.json({ user })
})

app.get('/auth/me', async (c) => {
  c.header('Cache-Control', 'no-store')
  const userId = await sessionUserId(c, c.env.DB)
  const user = userId === null ? null : await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(userId).first<User>()
  if (!user) return c.json({ error: 'Chưa đăng nhập hoặc phiên đã hết hạn' }, 401)
  return c.json({ user })
})

app.post('/auth/logout', async (c) => {
  c.header('Cache-Control', 'no-store')
  await endSession(c, c.env.DB)
  return c.json({ ok: true })
})

type OrderRow = {
  id: number; order_code: string; phone: string; customer_name: string; address: string; city: string
  payment_method: string; payment_status: string; total_amount: number; status: string; items_json: string
  note: string; created_at: string
}

function orderResponse(row: OrderRow, env: Env['Bindings']) {
  const { items_json, ...order } = row
  const account = order.status !== 'Đã hủy' && order.payment_method === 'Chuyển khoản VietQR' && order.payment_status === 'Chờ thanh toán'
    ? qrAccount(env) : null
  const qr_url = account ? `https://api.vietqr.io/image/${account}-compact.jpg?amount=${order.total_amount}&addInfo=${encodeURIComponent(order.order_code)}` : null
  return { ...order, items: JSON.parse(items_json), qr_url }
}

const ORDER_COLUMNS = 'id, order_code, phone, customer_name, address, city, payment_method, payment_status, total_amount, status, items_json, note, created_at'
const DISCOUNTS: ReadonlyMap<string, number> = new Map([['CLOUDPHONE500', 500_000], ['VIPMEMBER', 200_000]])

app.post('/orders', async (c) => {
  c.header('Cache-Control', 'no-store')
  const { DB } = c.env
  const userId = await sessionUserId(c, DB)
  if (userId === null) return c.json({ error: 'Vui lòng đăng nhập để đặt hàng' }, 401)
  const body = await parseBody(c)
  const key = cartKey(c)
  const requestId = boundedText(body?.request_id, 36)
  if (!key || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/.test(requestId)) {
    return c.json({ error: 'Yêu cầu đặt hàng không hợp lệ' }, 400)
  }
  const findExisting = () => DB.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = ? AND request_id = ?`)
    .bind(userId, requestId).first<OrderRow>()
  const prior = await findExisting()
  if (prior) return c.json({ ok: true, order: orderResponse(prior, c.env) })

  const phone = normalizedPhone(body?.phone)
  const name = boundedText(body?.customer_name, 120)
  const address = boundedText(body?.address, 300)
  const city = boundedText(body?.city, 100)
  const note = boundedText(body?.note, 500)
  if (!phone || !name || !address || !city || (body?.note && !note)) {
    return c.json({ error: 'Kiểm tra họ tên, số điện thoại, địa chỉ và ghi chú (tối đa 500 ký tự).' }, 400)
  }
  const qr = body?.payment_method === 'qr'
  if (body?.payment_method !== 'cod' && (!qr || !qrAccount(c.env))) {
    return c.json({ error: 'Phương thức thanh toán này chưa khả dụng.' }, 400)
  }
  const coupon = boundedText(body?.coupon_code, 24).toUpperCase()
  if (body?.coupon_code && !DISCOUNTS.has(coupon)) return c.json({ error: 'Mã giảm giá không hợp lệ.' }, 400)
  const care = body?.vip_care === true
  await ensureCart(c, key)
  const cart = await readCart(c, key)
  if (!cart.items.length) {
    const existing = await findExisting()
    if (existing) return c.json({ ok: true, order: orderResponse(existing, c.env) })
    return c.json({ error: 'Giỏ hàng trống.' }, 409)
  }
  // The preview identifies the chosen variants and quantities. Prices are always read from D1.
  const preview = body?.expected_items
  const expected = Array.isArray(preview) && preview.length <= 50
    ? new Map(preview.map((item) => [item?.variant_id, item?.qty]))
    : new Map()
  const total = Math.max(0, cart.total + (care ? 490_000 : 0) - (DISCOUNTS.get(coupon) ?? 0))
  if (total !== body?.expected_total || expected.size !== cart.items.length ||
      cart.items.some((item) => expected.get(item.variant_id) !== item.qty)) {
    return c.json({ error: 'Giá hoặc giỏ hàng đã thay đổi. Vui lòng mở lại giỏ để kiểm tra.' }, 409)
  }
  if (qr && total === 0) return c.json({ error: 'Đơn không cần chuyển khoản. Hãy chọn COD.' }, 400)
  const items = cart.items.map(({ variant_id, product, qty }) => ({
    variant_id, id: product.id, name: product.name, price: product.price, qty, image: product.image,
  }))
  const orderCode = 'CP-' + crypto.randomUUID().replace(/-/g, '').slice(0, 16).toUpperCase()
  try {
    const order = await DB.prepare(`
      INSERT INTO orders (
        order_code, user_id, phone, customer_name, address, city, note, payment_method, payment_status,
        total_amount, items_json, request_id, cart_key, coupon_code, vip_care
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING ${ORDER_COLUMNS}
    `).bind(orderCode, userId, phone, name, address, city, note, qr ? 'Chuyển khoản VietQR' : 'Thanh toán khi nhận hàng (COD)',
      qr ? 'Chờ thanh toán' : 'Thanh toán khi nhận hàng', total, JSON.stringify(items), requestId, key, coupon, Number(care))
      .first<OrderRow>()
    if (!order) throw new Error('Order not returned')
    trackEvent(c, 'checkout_success', {
      order_code: order.order_code,
      total_amount: order.total_amount,
      total_items: items.reduce((sum, item) => sum + item.qty, 0),
    })
    return c.json({ ok: true, order: orderResponse(order, c.env) }, 201)
  } catch (error) {
    const existing = await findExisting()
    if (existing) return c.json({ ok: true, order: orderResponse(existing, c.env) })
    const message = error instanceof Error ? error.message : ''
    if (message.includes('CHECKOUT_OUT_OF_STOCK')) return c.json({ error: 'Một hoặc nhiều sản phẩm không còn đủ hàng.' }, 409)
    if (message.includes('CHECKOUT_CART_CHANGED')) return c.json({ error: 'Giá hoặc giỏ hàng đã thay đổi. Vui lòng mở lại giỏ để kiểm tra.' }, 409)
    console.error('Failed to save order', error)
    return c.json({ error: 'Không thể lưu đơn hàng lúc này. Vui lòng thử lại.' }, 500)
  }
})

app.post('/orders/lookup', async (c) => {
  c.header('Cache-Control', 'no-store')
  const { DB } = c.env
  const userId = await sessionUserId(c, DB)
  if (userId === null) return c.json({ error: 'Vui lòng đăng nhập để xem đơn hàng của bạn' }, 401)
  const body = await parseBody(c)
  if (!body || Array.isArray(body)) return c.json({ error: 'Yêu cầu tra cứu không hợp lệ' }, 400)
  const code = boundedText(body.order_code, 24).toUpperCase()
  if (body.order_code && !/^CP-[A-Z0-9]{6,16}$/.test(code)) {
    return c.json({ error: 'Vui lòng nhập mã đơn đầy đủ, bắt đầu bằng CP-.' }, 400)
  }
  const { results } = await DB.prepare(`SELECT ${ORDER_COLUMNS} FROM orders WHERE user_id = ?
    AND (? = ? OR order_code = ?) ORDER BY id DESC LIMIT 30`).bind(userId, code, '', code).all<OrderRow>()
  const orders = results.map((row) => orderResponse(row, c.env))
  return c.json({ ok: true, order: orders[0], orders })
})

const ORDER_STATUSES = ['Đang xử lý', 'Đã xác nhận', 'Đang giao hàng', 'Giao thành công', 'Đã hủy'] as const
const PAYMENT_STATUSES = ['Chờ thanh toán', 'Thanh toán khi nhận hàng', 'Đã thanh toán'] as const

async function requireStaff(c: Context<Env>) {
  c.header('Cache-Control', 'no-store')
  const userId = await sessionUserId(c, c.env.DB)
  if (userId === null) {
    return { error: c.json({ error: 'Vui lòng đăng nhập tài khoản nhân viên' }, 401), user: null }
  }
  const user = await c.env.DB.prepare(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`)
    .bind(userId).first<User>()
  if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
    return { error: c.json({ error: 'Tài khoản này không có quyền quản trị nhân viên' }, 403), user: null }
  }
  return { error: null, user }
}

function invalidateProductCache() {
  memoryProducts = null
  memoryProductsTime = 0
}

function parseNonNegInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 1_000_000_000 ? value : null
}

function parseImagePath(value: unknown): string | null {
  const s = boundedText(value, 500)
  if (!s) return ''
  return s.startsWith('/') || /^https?:\/\//i.test(s) ? s : null
}

app.get('/admin/overview', async (c) => {
  const auth = await requireStaff(c)
  if (auth.error) return auth.error
  const { DB } = c.env
  const productStats = await DB.prepare(`
    SELECT
      COUNT(*) AS total_products,
      COALESCE(SUM(stock), 0) AS total_stock,
      COALESCE(SUM(CASE WHEN stock > 0 AND stock <= 5 THEN 1 ELSE 0 END), 0) AS low_stock_count,
      COALESCE(SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count
    FROM products
  `).first<{ total_products: number; total_stock: number; low_stock_count: number; out_of_stock_count: number }>()
  const orderStats = await DB.prepare(`
    SELECT
      COUNT(*) AS total_orders,
      COALESCE(SUM(CASE WHEN status IN ('Đang xử lý', 'Đã xác nhận') THEN 1 ELSE 0 END), 0) AS pending_orders,
      COALESCE(SUM(CASE WHEN status = 'Đang giao hàng' THEN 1 ELSE 0 END), 0) AS shipping_orders,
      COALESCE(SUM(CASE WHEN status = 'Giao thành công' THEN 1 ELSE 0 END), 0) AS completed_orders,
      COALESCE(SUM(CASE WHEN status <> 'Đã hủy' AND payment_status = 'Đã thanh toán' THEN total_amount ELSE 0 END), 0) AS total_revenue
    FROM orders
  `).first<{ total_orders: number; pending_orders: number; shipping_orders: number; completed_orders: number; total_revenue: number }>()
  return c.json({
    ok: true,
    can_sync_vectors: auth.user.role === 'admin' && !!c.env.AI && !!c.env.VECTORIZE,
    products: productStats ?? { total_products: 0, total_stock: 0, low_stock_count: 0, out_of_stock_count: 0 },
    orders: orderStats ?? { total_orders: 0, pending_orders: 0, shipping_orders: 0, completed_orders: 0, total_revenue: 0 },
  })
})

const TRAFFIC_EVENT_LABELS: { event: string; label: string }[] = [
  { event: 'page_view', label: 'Truy cập trang' },
  { event: 'view_product', label: 'Xem chi tiết máy' },
  { event: 'search', label: 'Tìm kiếm' },
  { event: 'filter_brand', label: 'Lọc theo hãng' },
  { event: 'chat_ai', label: 'Hỏi trợ lý BIX' },
  { event: 'compare_products', label: 'So sánh máy' },
  { event: 'add_to_cart', label: 'Thêm vào giỏ' },
  { event: 'order_lookup', label: 'Tra cứu đơn hàng' },
  { event: 'checkout_success', label: 'Đặt hàng thành công' },
]

function vnDayOffset(daysAgo: number): string {
  return new Date(Date.now() + 7 * 3600_000 - daysAgo * 86_400_000).toISOString().slice(0, 10)
}

app.get('/admin/traffic', async (c) => {
  const auth = await requireStaff(c)
  if (auth.error) return auth.error
  const rawDays = Number(c.req.query('days') || '14')
  const days = rawDays === 7 || rawDays === 30 ? rawDays : 14
  const startDay = vnDayOffset(days - 1)
  const today = vnToday()
  const { DB } = c.env

  const { results: dailyRows } = await DB.prepare(
    'SELECT day, event, count FROM traffic_daily WHERE day >= ? ORDER BY day ASC'
  ).bind(startDay).all<{ day: string; event: string; count: number }>()

  const { results: visitorRows } = await DB.prepare(
    'SELECT day, COUNT(*) AS visitors FROM traffic_visitors WHERE day >= ? GROUP BY day ORDER BY day ASC'
  ).bind(startDay).all<{ day: string; visitors: number }>()

  const { results: totalEventRows } = await DB.prepare(`
    SELECT event, SUM(count) AS total,
           COALESCE(SUM(CASE WHEN day = ? THEN count ELSE 0 END), 0) AS today
    FROM traffic_daily GROUP BY event
  `).bind(today).all<{ event: string; total: number; today: number }>()

  const totalVisitorsRow = await DB.prepare(`
    SELECT COALESCE(SUM(CASE WHEN day = ? THEN 1 ELSE 0 END), 0) AS today_visitors,
           COUNT(DISTINCT visitor_id) AS total_visitors
    FROM traffic_visitors
  `).bind(today).first<{ today_visitors: number; total_visitors: number }>()

  const dayMap = new Map<string, { page_views: number; visitors: number; interactions: number; add_to_cart: number; checkouts: number }>()
  for (let i = days - 1; i >= 0; i--) {
    dayMap.set(vnDayOffset(i), { page_views: 0, visitors: 0, interactions: 0, add_to_cart: 0, checkouts: 0 })
  }
  for (const row of dailyRows) {
    const entry = dayMap.get(row.day)
    if (!entry) continue
    if (row.event === 'page_view') entry.page_views += row.count
    else entry.interactions += row.count
    if (row.event === 'add_to_cart') entry.add_to_cart += row.count
    if (row.event === 'checkout_success') entry.checkouts += row.count
  }
  for (const row of visitorRows) {
    const entry = dayMap.get(row.day)
    if (entry) entry.visitors = row.visitors
  }

  const daily = [...dayMap.entries()].map(([day, stats]) => ({
    day,
    label: `${day.slice(8, 10)}/${day.slice(5, 7)}`,
    ...stats,
  }))

  const eventTotals = new Map(totalEventRows.map((r) => [r.event, { total: r.total, today: r.today }]))
  const events = TRAFFIC_EVENT_LABELS.map(({ event, label }) => ({
    event,
    label,
    total: eventTotals.get(event)?.total ?? 0,
    today: eventTotals.get(event)?.today ?? 0,
  })).sort((a, b) => b.total - a.total)

  const pageViewStats = eventTotals.get('page_view') ?? { total: 0, today: 0 }
  const checkoutStats = eventTotals.get('checkout_success') ?? { total: 0, today: 0 }
  const todayInteractions = totalEventRows
    .filter((r) => r.event !== 'page_view')
    .reduce((sum, r) => sum + r.today, 0)

  return c.json({
    ok: true,
    days,
    summary: {
      today_views: pageViewStats.today,
      total_views: pageViewStats.total,
      today_visitors: totalVisitorsRow?.today_visitors ?? 0,
      total_visitors: totalVisitorsRow?.total_visitors ?? 0,
      today_interactions: todayInteractions,
      total_checkouts: checkoutStats.total,
    },
    daily,
    events,
  })
})

app.get('/admin/products', async (c) => {
  const auth = await requireStaff(c)
  if (auth.error) return auth.error
  const q = c.req.query('q')?.trim().toLowerCase() || ''
  const brand = c.req.query('brand')?.trim() || ''
  const stockFilter = c.req.query('stock_filter')?.trim() || 'all'
  const conditions: string[] = []
  const params: unknown[] = []
  if (brand && brand !== 'All') {
    conditions.push('LOWER(brand) = LOWER(?)')
    params.push(brand)
  }
  if (q) {
    conditions.push('(LOWER(name) LIKE ? OR LOWER(chip) LIKE ? OR LOWER(tag) LIKE ?)')
    params.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }
  if (stockFilter === 'low') conditions.push('stock > 0 AND stock <= 5')
  else if (stockFilter === 'out') conditions.push('stock = 0')
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const stmt = c.env.DB.prepare(`SELECT * FROM products ${where} ORDER BY stock ASC, id ASC`)
  const { results } = params.length ? await stmt.bind(...params).all<Product>() : await stmt.all<Product>()
  return c.json({ ok: true, products: results })
})

app.post('/admin/products', async (c) => {
  const auth = await requireStaff(c)
  if (auth.error) return auth.error
  const body = await parseBody(c)
  const name = boundedText(body?.name, 160)
  const brand = boundedText(body?.brand, 60)
  const price = parseNonNegInt(body?.price)
  const stock = parseNonNegInt(body?.stock)
  const originalPrice = body?.original_price == null || body?.original_price === ''
    ? null : parseNonNegInt(body?.original_price)
  const parsedImage = parseImagePath(body?.image)
  if (parsedImage === null) {
    return c.json({ error: 'Đường dẫn hình ảnh phải bắt đầu bằng / hoặc http(s)://.' }, 400)
  }
  const image = parsedImage || '/phones/image-unavailable.png'
  const chip = boundedText(body?.chip, 160) || 'Đang cập nhật'
  const screen = boundedText(body?.screen, 160) || 'AMOLED 120Hz'
  const ramRom = boundedText(body?.ram_rom, 80) || '12GB / 256GB'
  const battery = boundedText(body?.battery, 160) || '5000 mAh'
  const camera = boundedText(body?.camera, 300)
  const tag = boundedText(body?.tag, 60)
  const description = boundedText(body?.description, 1000)

  if (!name || !brand || price === null || stock === null || (body?.original_price != null && body?.original_price !== '' && originalPrice === null)) {
    return c.json({ error: 'Vui lòng nhập tên máy, hãng, giá bán và tồn kho hợp lệ.' }, 400)
  }
  const product = await c.env.DB.prepare(`
    INSERT INTO products (name, brand, price, original_price, image, chip, screen, ram_rom, battery, camera, stock, tag, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *
  `).bind(name, brand, price, originalPrice, image, chip, screen, ramRom, battery, camera, stock, tag, description).first<Product>()
  invalidateProductCache()
  return c.json({ ok: true, product }, 201)
})

app.put('/admin/products/:id', async (c) => {
  const auth = await requireStaff(c)
  if (auth.error) return auth.error
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id < 1) return c.json({ error: 'Mã sản phẩm không hợp lệ' }, 400)
  const existing = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first<Product>()
  if (!existing) return c.json({ error: 'Không tìm thấy sản phẩm' }, 404)

  const body = await parseBody(c)
  if (!body) return c.json({ error: 'Dữ liệu cập nhật không hợp lệ' }, 400)

  const name = body.name !== undefined ? boundedText(body.name, 160) : existing.name
  const brand = body.brand !== undefined ? boundedText(body.brand, 60) : existing.brand
  const price = body.price !== undefined ? parseNonNegInt(body.price) : existing.price
  const stock = body.stock !== undefined ? parseNonNegInt(body.stock) : existing.stock
  const originalPrice = body.original_price === undefined ? existing.original_price
    : (body.original_price === null || body.original_price === '' ? null : parseNonNegInt(body.original_price))
  const parsedImage = body.image !== undefined ? parseImagePath(body.image) : existing.image
  if (parsedImage === null) {
    return c.json({ error: 'Đường dẫn hình ảnh phải bắt đầu bằng / hoặc http(s)://.' }, 400)
  }
  const image = parsedImage || existing.image
  const chip = body.chip !== undefined ? boundedText(body.chip, 160) : existing.chip
  const screen = body.screen !== undefined ? boundedText(body.screen, 160) : existing.screen
  const ramRom = body.ram_rom !== undefined ? boundedText(body.ram_rom, 80) : existing.ram_rom
  const battery = body.battery !== undefined ? boundedText(body.battery, 160) : existing.battery
  const camera = body.camera !== undefined ? boundedText(body.camera, 300) : existing.camera
  const tag = body.tag !== undefined ? boundedText(body.tag, 60) : existing.tag
  const description = body.description !== undefined ? boundedText(body.description, 1000) : existing.description

  if (!name || !brand || price === null || stock === null ||
      (body.original_price !== undefined && body.original_price !== null && body.original_price !== '' && originalPrice === null)) {
    return c.json({ error: 'Thông tin giá bán hoặc tồn kho không hợp lệ.' }, 400)
  }

  const updated = await c.env.DB.prepare(`
    UPDATE products
    SET name = ?, brand = ?, price = ?, original_price = ?, image = ?, chip = ?, screen = ?, ram_rom = ?, battery = ?, camera = ?, stock = coalesce(?, stock), tag = ?, description = ?
    WHERE id = ? RETURNING *
  `).bind(name, brand, price, originalPrice, image, chip, screen, ramRom, battery, camera, body.stock === undefined ? null : stock, tag, description, id).first<Product>()
  invalidateProductCache()
  return c.json({ ok: true, product: updated })
})

app.patch('/admin/products/:id/stock', async (c) => {
  const auth = await requireStaff(c)
  if (auth.error) return auth.error
  const id = Number(c.req.param('id'))
  if (!Number.isSafeInteger(id) || id < 1) return c.json({ error: 'Mã sản phẩm không hợp lệ' }, 400)
  const body = await parseBody(c)
  const exactStock = body?.stock !== undefined ? parseNonNegInt(body.stock) : null
  const delta = typeof body?.delta === 'number' && Number.isInteger(body.delta) && Math.abs(body.delta) <= 10_000 ? body.delta : null
  if (exactStock === null && delta === null) {
    return c.json({ error: 'Vui lòng cung cấp số lượng tồn kho hoặc mức điều chỉnh hợp lệ.' }, 400)
  }
  const updated = exactStock !== null
    ? await c.env.DB.prepare('UPDATE products SET stock = ? WHERE id = ? RETURNING *').bind(exactStock, id).first<Product>()
    : await c.env.DB.prepare('UPDATE products SET stock = max(0, stock + ?) WHERE id = ? RETURNING *').bind(delta, id).first<Product>()
  if (!updated) return c.json({ error: 'Không tìm thấy sản phẩm' }, 404)
  invalidateProductCache()
  return c.json({ ok: true, product: updated })
})

app.get('/admin/orders', async (c) => {
  const auth = await requireStaff(c)
  if (auth.error) return auth.error
  const status = c.req.query('status')?.trim() || ''
  const q = c.req.query('q')?.trim().toLowerCase() || ''
  const conditions: string[] = []
  const params: unknown[] = []
  if (status && status !== 'all') {
    conditions.push('status = ?')
    params.push(status)
  }
  if (q) {
    conditions.push('(LOWER(order_code) LIKE ? OR LOWER(customer_name) LIKE ? OR phone LIKE ?)')
    params.push(`%${q}%`, `%${q}%`, `%${q}%`)
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const stmt = c.env.DB.prepare(`SELECT ${ORDER_COLUMNS} FROM orders ${where} ORDER BY id DESC LIMIT 100`)
  const { results } = params.length ? await stmt.bind(...params).all<OrderRow>() : await stmt.all<OrderRow>()
  return c.json({ ok: true, orders: results.map((row) => orderResponse(row, c.env)) })
})

app.patch('/admin/orders/:orderCode', async (c) => {
  const auth = await requireStaff(c)
  if (auth.error) return auth.error
  const orderCode = boundedText(c.req.param('orderCode'), 32).toUpperCase()
  if (!orderCode) return c.json({ error: 'Mã đơn không hợp lệ' }, 400)
  const body = await parseBody(c)
  if (!body) return c.json({ error: 'Dữ liệu cập nhật không hợp lệ' }, 400)

  const nextStatus = body.status !== undefined ? boundedText(body.status, 40) : undefined
  const nextPayStatus = body.payment_status !== undefined ? boundedText(body.payment_status, 50) : undefined
  if (nextStatus !== undefined && !ORDER_STATUSES.includes(nextStatus as typeof ORDER_STATUSES[number])) {
    return c.json({ error: 'Trạng thái đơn hàng không hợp lệ' }, 400)
  }
  if (nextPayStatus !== undefined && !PAYMENT_STATUSES.includes(nextPayStatus as typeof PAYMENT_STATUSES[number])) {
    return c.json({ error: 'Trạng thái thanh toán không hợp lệ' }, 400)
  }
  if (nextStatus === undefined && nextPayStatus === undefined) {
    return c.json({ error: 'Không có trường nào cần cập nhật' }, 400)
  }

  try {
    const updated = await c.env.DB.prepare(`
      UPDATE orders
      SET status = coalesce(?, status), payment_status = coalesce(?, payment_status)
      WHERE order_code = ?
      RETURNING ${ORDER_COLUMNS}
    `).bind(nextStatus ?? null, nextPayStatus ?? null, orderCode).first<OrderRow>()
    if (!updated) return c.json({ error: 'Không tìm thấy đơn hàng' }, 404)
    if (nextStatus !== undefined) invalidateProductCache()
    return c.json({ ok: true, order: orderResponse(updated, c.env) })
  } catch (error) {
    if (error instanceof Error && error.message.includes('RESTORE_OUT_OF_STOCK')) {
      return c.json({ error: 'Không đủ tồn kho để khôi phục đơn này.' }, 409)
    }
    console.error('Failed to update order', error)
    return c.json({ error: 'Không thể cập nhật đơn hàng lúc này.' }, 500)
  }
})

app.post('/admin/sync-vectors', async (c) => {
  const auth = await requireStaff(c)
  if (auth.error) return auth.error
  if (auth.user.role !== 'admin') return c.json({ error: 'Cần quyền quản trị viên' }, 403)
  const { AI, VECTORIZE } = c.env
  if (!AI || !VECTORIZE) return c.json({ error: 'Chưa cấu hình Workers AI và Vectorize' }, 503)
  try {
    return c.json(await syncVectorStore(c.env, AI, VECTORIZE))
  } catch (error) {
    console.error('Failed to sync Vectorize', error)
    return c.json({ error: 'Không thể đồng bộ dữ liệu tư vấn lúc này.' }, 500)
  }
})

// Bộ nhớ tạm trong isolate Worker để tránh query CSDL D1 lặp lại liên tục
let memoryProducts: Product[] | null = null
let memoryProductsTime = 0
async function getCachedProducts(db: D1Database): Promise<Product[]> {
  const now = Date.now()
  if (memoryProducts && now - memoryProductsTime < 300_000) {
    return memoryProducts
  }
  const { results } = await db.prepare('SELECT * FROM products ORDER BY id ASC').all<Product>()
  memoryProducts = results || []
  memoryProductsTime = now
  return memoryProducts
}

// Phản hồi siêu tốc (< 15ms) cho các câu hỏi gợi ý phổ biến: ngắn gọn, đúng trọng tâm, chuyên nghiệp
function getInstantSuggestionReply(query: string, allProducts: Product[]): { reply: string; suggestions: string[]; products: Product[] } | null {
  const q = query.trim().toLowerCase().replace(/[?.,!]/g, '')

  // Nếu câu hỏi có chứa ngân sách cụ thể (VD: 15 triệu, dưới 10tr, 20 củ...) hoặc hãng cụ thể,
  // cần chuyển sang phân tích động để gợi ý máy chính xác theo tầm tiền khách yêu cầu
  const hasSpecificFilter = /\d+\s*(?:tr|triệu|củ|m)|\b(dưới|khoảng|tầm giá)\s*\d+/i.test(q)

  // 1. Chụp ảnh ngon nhất / camera đỉnh nhất
  if (!hasSpecificFilter && q.includes('chụp ảnh') && (q.includes('ngon') || q.includes('đỉnh') || q.includes('đẹp') || q.includes('nhất'))) {
    const x300 = allProducts.find((p) => p.name.includes('X300 Ultra')) || allProducts[0]
    const mi17 = allProducts.find((p) => p.name.includes('Xiaomi 17 Ultra')) || allProducts[1]
    const ip18 = allProducts.find((p) => p.name.includes('iPhone 18 Pro Max')) || allProducts[2]
    return {
      reply: `Dạ CloudPhone xin gợi ý 3 mẫu smartphone có hệ thống camera hàng đầu hiện nay:\n\n` +
        `1. **${x300.name} (${formatVndPrice(x300.price)}):** Cụm camera quang học ZEISS cảm biến lớn, tối ưu xuất sắc ảnh chân dung và khả năng zoom quang học độ nét cao.\n` +
        `2. **${mi17.name} (${formatVndPrice(mi17.price)}):** Cảm biến kích thước 1 inch hợp tác cùng Leica, 4 ống kính quang học với tele 200MP bắt trọn chi tiết.\n` +
        `3. **${ip18.name} (${formatVndPrice(ip18.price)}):** Camera Pro Fusion 48MP khẩu độ tùy chỉnh, chất lượng quay video 4K và chống rung hàng đầu thị trường.\n\n` +
        `Anh/chị ưu tiên chụp chân dung, phong cảnh zoom xa hay quay video để em hỗ trợ chi tiết hơn ạ?`,
      suggestions: [
        'So sánh vivo X300 Ultra với Xiaomi 17 Ultra',
        'iPhone 18 Pro Max giá bao nhiêu?',
        'Phương thức thanh toán',
      ],
      products: [x300, mi17, ip18].filter(Boolean),
    }
  }

  // 2. Chơi game đỉnh nhất / chiến game 144hz
  if (!hasSpecificFilter && (q.includes('chơi game') || q.includes('chiến game') || q.includes('game đỉnh') || q.includes('cày game') || q.includes('144hz'))) {
    const rog = allProducts.find((p) => p.name.includes('ROG Phone 8 Pro')) || allProducts[0]
    const mi17t = allProducts.find((p) => p.name.includes('Xiaomi 17T Pro')) || allProducts[1]
    return {
      reply: `Dạ nếu cần máy chuyên chơi game hiệu năng cao, CloudPhone xin đề xuất 2 mẫu máy tối ưu nhất:\n\n` +
        `1. **${rog.name} (${formatVndPrice(rog.price)}):** Màn hình AMOLED 165Hz siêu tốc, chip xử lý hàng đầu và hệ thống tản nhiệt buồng hơi chuyên dụng cho game thủ.\n` +
        `2. **${mi17t.name} (${formatVndPrice(mi17t.price)}):** Màn hình 144Hz, chip Dimensity 9500 mạnh mẽ và viên pin 7000mAh hỗ trợ sạc nhanh 100W với mức giá rất hợp lý.\n\n` +
        `Anh/chị thường chơi các tựa game nào để em tư vấn cấu hình phù hợp nhất ạ?`,
      suggestions: [
        'ASUS ROG Phone 8 Pro có sẵn hàng không?',
        'Xiaomi 17T Pro pin dùng được mấy tiếng?',
        'Chính sách bảo hành 1 đổi 1',
      ],
      products: [rog, mi17t].filter(Boolean),
    }
  }

  // 3. Phương thức thanh toán
  if (q.includes('trả góp') || q.includes('góp 0%') || q.includes('mua góp')) {
    return {
      reply: 'CloudPhone chưa hỗ trợ trả góp trực tuyến. Bạn có thể chọn thanh toán khi nhận hàng (COD).',
      suggestions: [
        'Con máy chụp ảnh ngon nhất?',
        'Máy nào chơi game đỉnh nhất?',
        'Chính sách bảo hành 1 đổi 1',
      ],
      products: [],
    }
  }

  // 4. Chính sách bảo hành 1 đổi 1
  if (q.includes('bảo hành') || q.includes('1 đổi 1') || q.includes('đổi mới')) {
    return {
      reply: `Dạ chính sách bảo hành tại CloudPhone bao gồm:\n\n` +
        `• **1 đổi 1 trong 30 ngày:** Máy có bất kỳ lỗi phần cứng nào từ nhà sản xuất sẽ được đổi ngay máy mới nguyên seal 100%.\n` +
        `• **Bảo hành chính hãng 12 - 24 tháng:** Bảo hành toàn diện tại tất cả trung tâm bảo hành ủy quyền của Apple, Samsung, Xiaomi trên toàn quốc.\n` +
        `• **Hỗ trợ máy dùng tạm:** Cung cấp thiết bị thay thế trong suốt thời gian bảo hành kỹ thuật để không gián đoạn công việc.\n\n` +
        `Anh/chị cần hỗ trợ thông tin chi tiết về sản phẩm nào không ạ?`,
      suggestions: [
        'Phương thức thanh toán',
        'Chính sách đổi trả và hoàn tiền',
        'Xem điện thoại hot hôm nay',
      ],
      products: [],
    }
  }

  // 5. Máy gập nào đáng mua?
  if (q.includes('máy gập') || q.includes('màn hình gập') || q.includes('điện thoại gập') || q.includes('fold')) {
    const fold8 = allProducts.find((p) => p.name.includes('Fold8')) || allProducts[0]
    const flip6 = allProducts.find((p) => p.name.includes('Flip6')) || allProducts[1]
    const duo = allProducts.find((p) => p.name.includes('iPhone Duo')) || allProducts[2]
    return {
      reply: `Dạ CloudPhone hiện phân phối các dòng smartphone màn hình gập chính hãng sau:\n\n` +
        `1. **${fold8.name} (${formatVndPrice(fold8.price)}):** Màn hình gập lớn 7.6 inch, tối ưu làm việc đa nhiệm và hỗ trợ bút S Pen.\n` +
        `2. **${flip6.name} (${formatVndPrice(flip6.price)}):** Thiết kế gập vỏ sò nhỏ gọn thời trang, màn hình phụ tiện lợi và chế độ FlexCam chụp ảnh linh hoạt.\n` +
        `3. **${duo.name} (${formatVndPrice(duo.price)}):** Siêu phẩm màn hình gập cao cấp từ Apple với khung titan siêu bền và màn hình ProMotion 120Hz.\n\n` +
        `Anh/chị cần dòng gập ngang màn hình lớn để làm việc hay gập dọc nhỏ gọn ạ?`,
      suggestions: [
        'Samsung Galaxy Z Fold8 giá bao nhiêu?',
        'Samsung Galaxy Z Flip6 có màu gì?',
        'Phương thức thanh toán',
      ],
      products: [fold8, flip6, duo].filter(Boolean),
    }
  }

  // 6. iPhone với Xiaomi máy nào quay phim tốt hơn?
  if (q.includes('iphone') && q.includes('xiaomi') && q.includes('quay phim')) {
    const ip18 = allProducts.find((p) => p.name.includes('iPhone 18 Pro Max')) || allProducts[0]
    const mi17 = allProducts.find((p) => p.name.includes('Xiaomi 17 Ultra')) || allProducts[1]
    return {
      reply: `Dạ so sánh giữa iPhone và Xiaomi về khả năng quay video:\n\n` +
        `• **iPhone (${ip18.name}):** Dẫn đầu về độ ổn định chống rung, màu sắc tự nhiên, mic thu âm trong trẻo và tối ưu chất lượng tốt nhất khi tải lên các nền tảng mạng xã hội (TikTok, Instagram, YouTube).\n` +
        `• **Xiaomi (${mi17.name}):** Thế mạnh về cảm biến lớn 1 inch và ống kính Leica cho khả năng thu sáng và xóa phông quang học cinematic, camera tele zoom xa nét.\n\n` +
        `Nếu ưu tiên quay video làm việc và sáng tạo nội dung hàng ngày, iPhone là lựa chọn tối ưu hơn ạ.`,
      suggestions: [
        'iPhone 18 Pro Max giá bao nhiêu?',
        'Xiaomi 17 Ultra giá bao nhiêu?',
        'Phương thức thanh toán',
      ],
      products: [ip18, mi17].filter(Boolean),
    }
  }

  return null
}

// Chatbot thông minh tư vấn chọn điện thoại (BIX AI Advisor - Tối ưu phản hồi nhanh & dí dỏm)
app.post('/chat', async (c) => {
  const { message } = await c.req.json<{ message?: string }>().catch(() => ({ message: '' }))
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return c.json({
      reply: 'Dạ em chào anh/chị! Em là **BIX** 🤖 - Chuyên viên tư vấn điện thoại tại CloudPhone.\nAnh/chị đang cần tìm máy chụp ảnh sống ảo siêu nét, cày game mượt mà màn 144Hz, pin trâu hay cần tìm trong tầm ngân sách bao nhiêu để em mách nước ngay cho mình nhé!',
      suggestions: [
        'Con máy chụp ảnh ngon nhất?',
        'iPhone với Xiaomi máy nào quay phim tốt hơn?',
        'Máy chơi game tốt nhất trong tầm giá?',
        'Máy gập nào đáng mua?',
        'Phương thức thanh toán',
      ],
      products: [],
    })
  }

  const userQuery = message.trim()
  if (userQuery.length > 1000) return c.json({ error: 'Câu hỏi tối đa 1000 ký tự.' }, 400)

  // 1. Lấy danh sách sản phẩm từ Cache bộ nhớ (0ms, không tốn thời gian truy vấn D1)

  const orderCodeMatch = userQuery.match(/\bCP-[A-Z0-9]{6,16}\b/i)
  const isOrderQuery = /đơn hàng|tra cứu đơn|kiểm tra đơn|tình trạng đơn/i.test(userQuery)
  if (orderCodeMatch || isOrderQuery) {
    c.header('Cache-Control', 'no-store')
    const userId = await sessionUserId(c, c.env.DB)
    if (userId === null || !orderCodeMatch) {
      return c.json({ reply: 'Anh/chị vui lòng đăng nhập và mở mục **Đơn hàng của tôi** để xem các đơn của mình.', products: [] })
    }
    const order = await c.env.DB.prepare('SELECT order_code, status, payment_status FROM orders WHERE user_id = ? AND order_code = ?')
      .bind(userId, orderCodeMatch[0].toUpperCase()).first<Pick<OrderRow, 'order_code' | 'status' | 'payment_status'>>()
    return c.json({
      reply: order
        ? `Đơn **${order.order_code}**: ${order.status}. Thanh toán: ${order.payment_status}. Anh/chị có thể xem chi tiết trong **Đơn hàng của tôi**.`
        : 'BIX không tìm thấy đơn này trong tài khoản của anh/chị. Vui lòng kiểm tra mã đơn.',
      products: [],
    })
  }

  const allProducts = await getCachedProducts(c.env.DB)
  const intent = extractIntent(userQuery)

  // 0. Xử lý câu chào hỏi giao tiếp cơ bản (Tuyệt đối không tự tiện tư vấn sản phẩm khi khách chỉ chào)
  const cleanQ = userQuery.toLowerCase().replace(/[\s.,?!~]+/g, ' ').trim()
  const isGreeting =
    /^(hello|hi|chào|chào em|chào bạn|chào shop|hello em|hi em|chào ad|alo|alo em|em ơi|shop ơi|bix ơi|ad ơi|có ai không|còn ai không)(\s+(ơi|em|bạn|ad|shop|nha|nhé|ạ))?$/i.test(cleanQ)

  if (isGreeting) {
    return c.json({
      reply: 'Dạ em chào anh/chị ạ! Em là **BIX** 🤖 - Chuyên viên tư vấn smartphone tại CloudPhone.\nHôm nay em có thể hỗ trợ anh/chị tìm dòng máy theo nhu cầu nào (chụp ảnh đẹp, chiến game mượt, pin trâu) hay trong tầm ngân sách bao nhiêu để em tư vấn chi tiết cho mình nhé ạ! 😊',
      suggestions: [
        'Con máy chụp ảnh ngon nhất?',
        'Máy nào chơi game đỉnh nhất?',
        'Tư vấn máy tầm 15 triệu',
        'Phương thức thanh toán',
      ],
      products: [],
    })
  }

  // 0. Phản hồi siêu tốc tức thì (< 15ms) cho các câu hỏi gợi ý phổ biến (Tránh gọi LLM nặng)
  // Chỉ áp dụng cho câu hỏi chung chung, không áp dụng khi khách hỏi đích danh 1 máy cụ thể
  let instantSuggestion: any = null
  if (!intent.specificModel && intent.maxBudget === undefined && !intent.wantsFoldable) {
    instantSuggestion = getInstantSuggestionReply(userQuery, allProducts)
  }
  if (instantSuggestion) {
    return c.json(instantSuggestion)
  }

  // 0. Xử lý các case đặc biệt (danh tính BIX, ngoài lề, dòng máy không bán, tra cứu tồn kho, hỏi đích danh 1 máy)
  if (
    intent.isIdentity ||
    intent.unsupportedModel ||
    intent.isOutOfScope ||
    (intent.specificModel && !intent.isComparison) ||
    (intent.isAvailabilityCheck && intent.availabilityTarget)
  ) {
    const ranked = scoreAndRankProducts(allProducts, intent)
    const adviceRes = generateAdvice(intent, ranked, allProducts)
    return c.json(adviceRes)
  }

  try {
    let matchedProducts: Product[] = []
    let matchedPolicies: Policy[] = []

    const hasSpecificIntent =
      intent.wantsPhoto ||
      intent.wantsVideo ||
      intent.wantsGaming ||
      intent.wantsBattery ||
      intent.wantsFoldable ||
      intent.maxBudget !== undefined ||
      intent.isGeneralBest ||
      intent.isSuperlative ||
      intent.brandPreference !== undefined ||
      intent.specificModel !== undefined ||
      intent.isComparison

    // FAST-BYPASS SIÊU TỐC: Nếu khách đã nêu rõ nhu cầu (giá, ảnh, game, pin...), thuật toán chuyên gia
    // xử lý ngay trong < 1ms từ RAM, mang lại câu trả lời dí dỏm, chuẩn giá và phản hồi tức thì (< 15ms)
    if (hasSpecificIntent) {
      const ranked = scoreAndRankProducts(allProducts, intent)
      const adviceRes = generateAdvice(intent, ranked, allProducts)
      return c.json(adviceRes)
    } else if (intent.isPolicy) {
      // Tìm chính sách cụ thể từ D1 nếu hỏi về bảo hành/trả góp
      let polCategory = ''
      const qLow = userQuery.toLowerCase()
      if (qLow.includes('trả góp')) polCategory = 'installment'
      else if (qLow.includes('bảo hành') || qLow.includes('1 đổi 1')) polCategory = 'warranty'
      else if (qLow.includes('giao hàng') || qLow.includes('ship')) polCategory = 'shipping'
      else if (qLow.includes('đổi trả')) polCategory = 'returns'
      else if (qLow.includes('thu cũ') || qLow.includes('lên đời')) polCategory = 'trade-in'
      else if (qLow.includes('thanh toán') || qLow.includes('cod')) polCategory = 'payment'

      if (polCategory) {
        const { results: specificPolicies } = await c.env.DB.prepare('SELECT * FROM policies WHERE category = ?')
          .bind(polCategory)
          .all<Policy>()
        matchedPolicies = specificPolicies
      } else {
        const { results: allPols } = await c.env.DB.prepare('SELECT * FROM policies LIMIT 5').all<Policy>()
        matchedPolicies = allPols
      }
    } else {
      const { AI, VECTORIZE } = c.env
      const queryEmbed = AI && VECTORIZE
        ? (await AI.run('@cf/baai/bge-m3', { text: [userQuery] })) as { data?: number[][] }
        : null
      const queryVector = queryEmbed?.data?.[0]

      if (VECTORIZE && queryVector?.length) {
        const searchRes = await VECTORIZE.query(queryVector, {
          topK: 4,
          returnMetadata: 'all',
        })

        const prodIds = searchRes.matches
          .filter((m) => m.id.startsWith('prod_'))
          .map((m) => Number(m.id.replace('prod_', '')))
          .filter((id) => !isNaN(id))

        if (prodIds.length > 0) {
          const prodMap = new Map(allProducts.map((p) => [p.id, p]))
          matchedProducts = prodIds.flatMap((id: number) => {
            const p = prodMap.get(id)
            return p ? [p] : []
          }).slice(0, 3)
        }
      }

      if (matchedProducts.length === 0) {
        const ranked = scoreAndRankProducts(allProducts, intent)
        matchedProducts = ranked.slice(0, 3).map((r) => r.product)
      }
    }

    // Giới hạn tối đa 3 sản phẩm đắt giá nhất
    matchedProducts = matchedProducts.slice(0, 3)

    // 3. Xây dựng ngữ cảnh RAG cho Model LLM
    let contextText = ''
    if (matchedProducts.length > 0) {
      contextText += '=== SẢN PHẨM PHÙ HỢP TỪ KHO HÀNG CloudPhone ===\n'
      for (const p of matchedProducts) {
        contextText +=
          `- ${p.name} (${p.brand}) - Giá: ${formatVndPrice(p.price)}\n` +
          `  + Cấu hình: ${p.chip}, Màn hình: ${p.screen}\n` +
          `  + Camera: ${p.camera}\n` +
          `  + Pin: ${p.battery}\n` +
          `  + Điểm nổi bật: ${p.description}\n\n`
      }
    }

    if (matchedPolicies.length > 0) {
      contextText += '=== CHÍNH SÁCH CloudPhone ===\n'
      for (const pol of matchedPolicies) {
        contextText += `- ${pol.title}: ${pol.content}\n`
      }
    }

    const systemPrompt = `Bạn là BIX 🤖 - Chuyên viên tư vấn smartphone thông minh, chuyên nghiệp, chuẩn xác và tận tâm tại hệ thống CloudPhone.

NGUYÊN TẮC BẮT BUỘC:
1. TRẢ LỜI ĐÚNG TRỌNG TÂM, NGẮN GỌN:
   - Trả lời thẳng vào câu hỏi của khách, ngắn gọn và súc tích (tối đa 2-3 câu hoặc danh sách ngắn).
   - Không lan man dài dòng, không nói chuyện phiếm, không dùng từ ngữ cợt nhả hoặc văn phong lố lăng.
   - Xưng "em", gọi khách là "anh/chị". Giọng điệu chuyên nghiệp, lễ phép, tôn trọng.

2. PHẠM VI TƯ VẤN (CHỈ TƯ VẤN ĐIỆN THOẠI):
   - BIX CHỈ trả lời các câu hỏi về điện thoại, thông số kỹ thuật, giá bán và chính sách tại CloudPhone và phương thức thanh toán hiện có. CloudPhone chưa hỗ trợ trả góp trực tuyến.
   - Nếu khách hỏi bất kỳ chủ đề nào ngoài lề (thời tiết, nấu ăn, toán học, lập trình, văn thơ, chính trị, cuộc sống...): BẮT BUỘC TỪ CHỐI với câu mẫu:
     "Dạ em là trợ lý BIX chuyên tư vấn điện thoại tại CloudPhone nên xin phép từ chối trả lời các chủ đề ngoài lề ạ. Em chỉ có thể hỗ trợ về thông số kỹ thuật, giá bán và chọn mua điện thoại tại CloudPhone thôi ạ."

3. TUYỆT ĐỐI KHÔNG BỊA ĐẶT (KHÔNG CÓ THÌ NÓI KHÔNG CÓ):
   - Máy nào không có trong danh sách [DỮ LIỆU SẢN PHẨM & CHÍNH SÁCH TẠI CloudPhone] thì phải nói rõ: CloudPhone hiện không kinh doanh dòng máy này.
   - Không được tự bịa ra thông số, không tự bịa điểm số benchmark hay cấu hình không có trong dữ liệu. Chỉ dùng đúng thông số chip, màn hình, camera, pin từ dữ liệu.

4. TÌNH TRẠNG KHO HÀNG THỰC TẾ:
   - Các dòng máy trong dữ liệu (kể cả Xiaomi 17 Ultra 5G, iPhone Duo gập, Galaxy S26 Ultra) ĐỀU LÀ SẢN PHẨM CHÍNH HÃNG ĐÃ SẢN XUẤT RA THỊ TRƯỜNG VÀ ĐANG BÁN TẠI CloudPhone. Tuyệt đối không được nói là máy tương lai hay chưa ra mắt.

5. KHI KHÁCH HỎI ĐÍCH DANH 1 DÒNG MÁY CỤ THỂ:
   - Chỉ tập trung tư vấn đúng dòng máy đó (giá bán, thông số chip/màn hình/camera/pin, phương thức thanh toán).
   - Tuyệt đối KHÔNG liệt kê tràn lan các dòng máy khác khiến khách khó chịu.`

    const userPrompt = `[DỮ LIỆU SẢN PHẨM & CHÍNH SÁCH TẠI CloudPhone]:\n${
      contextText || 'Kho hàng CloudPhone đầy đủ các mẫu smartphone flagship và tầm trung.'
    }\n\n[CÂU HỎI CỦA KHÁCH]:\n${userQuery}\n\n[LƯU Ý]: Trả lời tự nhiên, lịch sự, đúng trọng tâm câu hỏi của khách.`

    const { AI } = c.env
    if (!AI) {
      if (matchedPolicies.length) return c.json({
        reply: matchedPolicies.map((policy) => '**' + policy.title + '**\n' + policy.content).join('\n\n'),
        products: [],
      })
      return c.json(generateAdvice(intent, scoreAndRankProducts(allProducts, intent), allProducts))
    }

    // 4. Gọi Workers AI khi dự án đã cấu hình binding.
    let aiReply = ''
    try {
      const aiChatRes = (await AI.run('@cf/meta/llama-3.1-8b-instruct' as any, {
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 320,
        temperature: 0.65,
      })) as { response?: string }
      aiReply = aiChatRes.response || ''
    } catch {
      try {
        const fallbackChatRes = (await AI.run('@cf/meta/llama-3.3-70b-instruct-fp8-fast' as any, {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 320,
          temperature: 0.65,
        })) as { response?: string }
        aiReply = fallbackChatRes.response || ''
      } catch {
        const fallbackChatRes = (await AI.run('@cf/meta/llama-3.2-3b-instruct' as any, {
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          max_tokens: 300,
          temperature: 0.6,
        })) as { response?: string }
        aiReply = fallbackChatRes.response || ''
      }
    }

    const reply =
      aiReply ||
      'Chào bạn! Mình có thể hỗ trợ tư vấn chi tiết về cấu hình, camera hoặc chính sách trả góp của các dòng máy tại CloudPhone ạ.'

    // Lọc ra danh sách các máy THỰC SỰ được AI đề cập và tư vấn trong câu trả lời
    let finalProducts: Product[] = []
    if (!intent.isPolicy) {
      const replyLower = reply.toLowerCase()
      const mentioned: { product: Product; index: number }[] = []

      // Tìm trong danh sách sản phẩm ứng viên
      for (const p of matchedProducts) {
        const fullName = p.name.toLowerCase()
        let pos = replyLower.indexOf(fullName)

        if (pos === -1) {
          // Bỏ bớt thông số phụ: 5G, ram/rom...
          const cleanName = fullName
            .replace(/\b(5g|16gb\/512gb|12gb\/256gb|8gb\/128gb|256gb|128gb|512gb)\b/gi, '')
            .replace(/\s+/g, ' ')
            .trim()
          pos = replyLower.indexOf(cleanName)
        }

        if (pos === -1) {
          // Từ khoá model chính (ví dụ: "rog phone 8", "gt8 pro", "17 ultra", "x300 ultra", "s26 ultra")
          const brand = p.brand.toLowerCase()
          const modelPart = fullName
            .replace(brand, '')
            .replace(/\b(5g|16gb\/512gb|12gb\/256gb|8gb\/128gb|256gb|128gb|512gb)\b/gi, '')
            .trim()
          const keyTokens = modelPart.split(/\s+/).slice(0, 2).join(' ')
          if (keyTokens.length >= 3 && replyLower.includes(keyTokens)) {
            pos = replyLower.indexOf(keyTokens)
          }
        }

        if (pos !== -1) {
          mentioned.push({ product: p, index: pos })
        }
      }

      // Sắp xếp đúng theo thứ tự AI đã nhắc tới trong bài viết
      mentioned.sort((a, b) => a.index - b.index)

      // Nếu tìm thấy máy được AI nhắc, CHỈ giữ đúng các máy đó!
      if (mentioned.length > 0) {
        finalProducts = mentioned.map((m) => m.product)
      } else {
        // Nếu AI không nhắc đến sản phẩm nào (từ chối, câu hỏi ngoài lề, kiến thức chung) -> KHÔNG HIỆN THẺ SẢN PHẨM NÀO!
        finalProducts = []
      }
    }

    const suggestions: string[] = []
    if (finalProducts.length > 0) {
      suggestions.push(`${finalProducts[0].name} có hàng không?`)
      if (finalProducts.length > 1) {
        suggestions.push(`So sánh ${finalProducts[0].name} với ${finalProducts[1].name}`)
      }
    } else {
      suggestions.push('Con máy chụp ảnh ngon nhất?', 'Máy nào chơi game đỉnh nhất?')
    }
    suggestions.push('Phương thức thanh toán', 'Chính sách bảo hành 1 đổi 1')

    return c.json({
      reply,
      suggestions: suggestions.slice(0, 4),
      products: finalProducts,
    })
  } catch (aiError) {
    console.error('Lỗi khi gọi Workers AI (chuyển sang fallback an toàn):', aiError)
    // Fallback an toàn đảm bảo hệ thống không bao giờ gặp lỗi 500
    const ranked = scoreAndRankProducts(allProducts, intent)
    const fallbackResponse = generateAdvice(intent, ranked, allProducts)
    return c.json(fallbackResponse)
  }
})

export default app
