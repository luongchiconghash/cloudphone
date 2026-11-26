import { cartId } from '../api'

export function trackStoreEvent(event: 'page_view' | 'view_product' | 'filter_brand' | 'search' | 'compare_products' | 'chat_ai' | 'order_lookup') {
  void fetch('/api/analytics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-cart-id': cartId },
    body: JSON.stringify({ event }),
    keepalive: true,
  }).catch(() => {})
}
