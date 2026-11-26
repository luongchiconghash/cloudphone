import type { Product } from './index'

export interface ExtractedIntent {
  raw: string
  normalized: string
  // Budgets (in VND)
  minBudget?: number
  maxBudget?: number
  budgetExclusive?: boolean
  targetBudget?: number
  isValueForMoney?: boolean

  // Core needs
  wantsPhoto?: boolean
  wantsVideo?: boolean
  wantsGaming?: boolean
  wantsBattery?: boolean
  wantsFoldable?: boolean
  wantsAI?: boolean
  wantsWorkStudy?: boolean
  wantsCompact?: boolean

  // Special intents
  isComparison?: boolean
  isGeneralBest?: boolean
  isSuperlative?: boolean
  isPolicy?: boolean
  isOutOfScope?: boolean
  isIdentity?: boolean

  // Brand preference
  brandPreference?: string

  // Specific model mentions
  specificModel?: string
  unsupportedModel?: string
  isAvailabilityCheck?: boolean
  availabilityTarget?: string
  wantsProsCons?: boolean
  wantsPriceCheck?: boolean
}

export interface ScoredProduct {
  product: Product
  score: number
  reasons: string[]
  tradeOffs: string[]
}

export interface ChatResponse {
  reply: string
  suggestions: string[]
  products: Product[]
}

// Format VND currency for text
export function formatVnd(amount: number): string {
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000
    return `${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)} triệu`
  }
  return `${(amount / 1_000).toFixed(0)}k`
}

// 1. Phân tích ý định người dùng (Intent Parser)
export function extractIntent(message: string): ExtractedIntent {
  const raw = message.trim()
  const lower = raw.toLowerCase()

  // Chuẩn hoá từ viết tắt và khoảng trắng giữa chữ & số (VD: "nokia1280" -> "nokia 1280", "ip18" -> "iphone 18")
  let normalized = lower
    .replace(/([a-zA-Z]+)(\d+)/g, '$1 $2')
    .replace(/(\d+)([a-zA-Z]+)/g, '$1 $2')
    .replace(/(^|[\s,?!.])ip([\s,?!.]|$)/g, '$1iphone$2')
    .replace(/(^|[\s,?!.])ss([\s,?!.]|$)/g, '$1samsung$2')
    .replace(/(^|[\s,?!.])mi([\s,?!.]|$)/g, '$1xiaomi$2')
    .replace(/(\d+)\s*(?:tr|triệu|củ|m)(?=[\s,?!.]|$)/g, '$1 triệu')
    .replace(/(^|[\s,?!.])củ([\s,?!.]|$)/g, '$1triệu$2')

  const intent: ExtractedIntent = {
    raw,
    normalized,
  }

  // --- Parse Budget ---
  // Dưới X triệu
  const underMatch = normalized.match(/(?:dưới|tầm dưới|nhỏ hơn|<|dưới mức)\s*(\d+(?:[.,]\d+)?)\s*triệu/i)
  if (underMatch) {
    const val = parseFloat(underMatch[1].replace(',', '.'))
    intent.maxBudget = val * 1_000_000
    intent.budgetExclusive = true
  }

  // Khoảng / Tầm / Tầm giá X triệu
  const approxMatch = normalized.match(/(?:khoảng|tầm|quanh|xung quanh|tầm khoảng)\s*(\d+(?:[.,]\d+)?)\s*triệu/i)
  if (approxMatch && intent.maxBudget === undefined) {
    const val = parseFloat(approxMatch[1].replace(',', '.'))
    intent.targetBudget = val * 1_000_000
    intent.minBudget = Math.max(0, (val - 3) * 1_000_000)
    intent.maxBudget = (val + 3.5) * 1_000_000
  }

  // Từ X đến Y triệu
  const rangeMatch = normalized.match(/từ\s*(\d+(?:[.,]\d+)?)\s*(?:đến|-)\s*(\d+(?:[.,]\d+)?)\s*triệu/i)
  if (rangeMatch && intent.maxBudget === undefined) {
    const minVal = parseFloat(rangeMatch[1].replace(',', '.'))
    const maxVal = parseFloat(rangeMatch[2].replace(',', '.'))
    intent.minBudget = minVal * 1_000_000
    intent.maxBudget = maxVal * 1_000_000
  }

  // X triệu đổ lại / quay đầu
  const capMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*triệu\s*(?:đổ lại|quay đầu|trở xuống)/i)
  if (capMatch && intent.maxBudget === undefined) {
    const val = parseFloat(capMatch[1].replace(',', '.'))
    intent.maxBudget = val * 1_000_000
  }

  // "Tao có 10 triệu" / "ngân sách 10 triệu" / "10 triệu nên mua máy nào"
  const exactHaveMatch = normalized.match(/(?:có|ngân sách|tài chính|cầm|với|tối đa|không quá)\s*(\d+(?:[.,]\d+)?)\s*triệu/i)
  if (exactHaveMatch && !intent.maxBudget) {
    const val = parseFloat(exactHaveMatch[1].replace(',', '.'))
    intent.targetBudget = val * 1_000_000
    intent.maxBudget = val * 1_000_000
  } else if (!intent.maxBudget && !intent.targetBudget) {
    const standaloneMatch = normalized.match(/(\d+(?:[.,]\d+)?)\s*triệu/i)
    if (standaloneMatch) {
      const val = parseFloat(standaloneMatch[1].replace(',', '.'))
      intent.targetBudget = val * 1_000_000
      intent.maxBudget = val * 1_000_000
    }
  }

  // Giá rẻ / tiết kiệm / học sinh / sinh viên
  if (
    normalized.includes('giá rẻ') ||
    normalized.includes('tiết kiệm') ||
    normalized.includes('sinh viên') ||
    normalized.includes('học sinh') ||
    normalized.includes('bình dân') ||
    normalized.includes('tầm trung')
  ) {
    if (!intent.maxBudget) {
      intent.maxBudget = 15_000_000
    }
    intent.isValueForMoney = true
  }

  // "trong tầm giá" / "p/p" / "đáng tiền"
  if (
    normalized.includes('trong tầm giá') ||
    normalized.includes('tầm giá') ||
    normalized.includes('p/p') ||
    normalized.includes('đáng tiền') ||
    normalized.includes('ngon bổ rẻ')
  ) {
    intent.isValueForMoney = true
  }

  // --- Parse Core Needs ---
  // 1. Chụp ảnh (Photo)
  const isCasualPhoto =
    normalized.includes('thỉnh thoảng chụp') ||
    normalized.includes('ít chụp') ||
    normalized.includes('ít khi chụp') ||
    normalized.includes('chụp cơ bản') ||
    normalized.includes('thỉnh thoảng mới chụp')

  if (
    !isCasualPhoto &&
    (normalized.includes('chụp') ||
      normalized.includes('ảnh') ||
      normalized.includes('camera') ||
      normalized.includes('sống ảo') ||
      normalized.includes('chân dung') ||
      normalized.includes('phong cảnh') ||
      normalized.includes('zoom') ||
      normalized.includes('tele') ||
      normalized.includes('leica') ||
      normalized.includes('zeiss') ||
      normalized.includes('hasselblad') ||
      normalized.includes('chụp đêm') ||
      normalized.includes('nhiếp ảnh'))
  ) {
    intent.wantsPhoto = true
  }

  // 2. Quay phim (Video) - phân biệt rõ với chụp ảnh!
  if (
    normalized.includes('quay phim') ||
    normalized.includes('quay video') ||
    normalized.includes('quay clip') ||
    normalized.includes('quay tiktok') ||
    normalized.includes('tiktok') ||
    normalized.includes('vlog') ||
    normalized.includes('vlogger') ||
    normalized.includes('youtube') ||
    normalized.includes('youtuber') ||
    normalized.includes('reels') ||
    normalized.includes('làm video') ||
    normalized.includes('làm clip') ||
    normalized.includes('chuyên quay') ||
    (normalized.includes('quay') && !normalized.includes('quay đầu'))
  ) {
    intent.wantsVideo = true
  }

  // 3. Gaming & Hiệu năng
  if (
    normalized.includes('game') ||
    normalized.includes('gaming') ||
    normalized.includes('chơi game') ||
    normalized.includes('chiến game') ||
    normalized.includes('fps') ||
    normalized.includes('giả lập') ||
    normalized.includes('genshin') ||
    normalized.includes('liên quân') ||
    normalized.includes('pubg') ||
    normalized.includes('tốc chiến') ||
    normalized.includes('đồ họa') ||
    normalized.includes('cấu hình') ||
    normalized.includes('hiệu năng') ||
    normalized.includes('mượt mà') ||
    normalized.includes('snapdragon') ||
    normalized.includes('quái vật')
  ) {
    intent.wantsGaming = true
  }

  // 4. Pin trâu & Thời lượng sử dụng
  if (
    normalized.includes('pin') ||
    normalized.includes('trâu') ||
    normalized.includes('dùng lâu') ||
    normalized.includes('ít sạc') ||
    normalized.includes('8000') ||
    normalized.includes('7000') ||
    normalized.includes('mah') ||
    normalized.includes('thời lượng pin')
  ) {
    intent.wantsBattery = true
  }

  // 5. Điện thoại gập
  if (
    normalized.includes('gập') ||
    normalized.includes('fold') ||
    normalized.includes('flip') ||
    normalized.includes('duo') ||
    normalized.includes('vỏ sò') ||
    normalized.includes('màn hình gập')
  ) {
    intent.wantsFoldable = true
  }

  // 6. AI
  if (
    normalized.includes('ai') ||
    normalized.includes('galaxy ai') ||
    normalized.includes('gemini') ||
    normalized.includes('trí tuệ nhân tạo')
  ) {
    intent.wantsAI = true
  }

  // 7. Học tập, làm việc hằng ngày
  if (
    normalized.includes('học tập') ||
    normalized.includes('học') ||
    normalized.includes('làm việc') ||
    normalized.includes('văn phòng') ||
    normalized.includes('công việc') ||
    normalized.includes('hằng ngày') ||
    normalized.includes('tác vụ')
  ) {
    intent.wantsWorkStudy = true
  }

  // 8. Kích thước nhỏ gọn
  if (
    normalized.includes('nhỏ gọn') ||
    normalized.includes('gọn nhẹ') ||
    normalized.includes('không quá to') ||
    normalized.includes('vừa tay') ||
    normalized.includes('bé') ||
    normalized.includes('gọn')
  ) {
    intent.wantsCompact = true
  }

  // 9. So sánh
  const isPoliteWithParticle = /(?:giúp|tư vấn|hỏi|cho|em|mình)\s+.*?\bvới(?:\s*(?:ạ|nhé|nha|với|shop|ad|bix|[.!?]))?$/i.test(normalized)
  if (
    !isPoliteWithParticle &&
    (normalized.includes('so sánh') ||
      normalized.includes('máy nào hơn') ||
      normalized.includes('máy nào tốt hơn') ||
      normalized.includes('hay là') ||
      normalized.includes('giữa') ||
      /\b(?:so sánh|chọn|nên mua)\s+.*?\bvới\b/i.test(normalized) ||
      /\b(?:iphone|xiaomi|samsung|oppo|vivo|realme|pixel|rog)\b.*?\bvới\s+(?:con\s+|máy\s+)?(?:iphone|xiaomi|samsung|oppo|vivo|realme|pixel|rog)\b/i.test(normalized))
  ) {
    intent.isComparison = true
  }

  // 10. Câu hỏi cực cấp: "tốt nhất hiện tại", "đáng mua nhất", "máy nào ngon nhất", "đỉnh nhất", "đẹp nhất", "số 1"
  const isSuperlative =
    normalized.includes('tốt nhất') ||
    normalized.includes('ngon nhất') ||
    normalized.includes('đáng mua nhất') ||
    normalized.includes('đỉnh nhất') ||
    normalized.includes('xịn nhất') ||
    normalized.includes('đẹp nhất') ||
    normalized.includes('toàn diện nhất') ||
    normalized.includes('số 1') ||
    normalized.includes('quán quân') ||
    normalized.includes('chất lượng nhất') ||
    normalized.includes('flagship nào')

  if (isSuperlative) {
    intent.isSuperlative = true
    // Nếu không có nhu cầu hẹp như camera, gaming, pin, fold thì đây là general best
    if (!intent.wantsPhoto && !intent.wantsVideo && !intent.wantsGaming && !intent.wantsBattery && !intent.wantsFoldable) {
      intent.isGeneralBest = true
    }
  }

  // 11. Chính sách bán hàng, bảo hành, đổi trả, trả góp, vận chuyển
  if (
    normalized.includes('trả góp') ||
    normalized.includes('bảo hành') ||
    normalized.includes('khuyến mãi') ||
    normalized.includes('ưu đãi') ||
    normalized.includes('giao hàng') ||
    normalized.includes('ship') ||
    normalized.includes('đổi trả') ||
    normalized.includes('1 đổi 1') ||
    normalized.includes('thu cũ') ||
    normalized.includes('thanh toán') ||
    normalized.includes('cod')
  ) {
    intent.isPolicy = true
  }

  // 12. Câu hỏi về danh tính AI (tên, model, phiên bản)
  const isBotIdentity =
    normalized.includes('model gì') ||
    normalized.includes('mô hình gì') ||
    normalized.includes('dùng model gì') ||
    normalized.includes('mày là model gì') ||
    normalized.includes('bạn là model gì') ||
    normalized.includes('mày là ai') ||
    normalized.includes('bạn là ai') ||
    normalized.includes('mày là gì') ||
    normalized.includes('bạn là con gì') ||
    normalized.includes('bạn tên gì') ||
    normalized.includes('ai tạo ra bạn') ||
    normalized.includes('bix là ai') ||
    normalized.includes('bix là gì') ||
    normalized.includes('dùng ai gì') ||
    normalized.includes('sử dụng model nào')

  if (isBotIdentity) {
    intent.isIdentity = true
    intent.isOutOfScope = false
    intent.isPolicy = false
  }

  // 13. Phát hiện câu hỏi ngoài phạm vi (bên thứ ba, dịch vụ khác, toán học, chủ đề không liên quan)
  const isThirdPartyOrExternal =
    normalized.includes('shopee') ||
    normalized.includes('shoppe') ||
    normalized.includes('lazada') ||
    normalized.includes('tiki') ||
    normalized.includes('tiktok shop') ||
    normalized.includes('sendo') ||
    normalized.includes('spaylater') ||
    normalized.includes('ví trả sau') ||
    normalized.includes('momo') ||
    normalized.includes('zalopay')

  const isMathOrTrivia =
    normalized.includes('bằng mấy') ||
    normalized.includes('1-1') ||
    normalized.includes('1+1') ||
    normalized.includes('cộng') ||
    normalized.includes('trừ') ||
    normalized.includes('nhân') ||
    normalized.includes('chia') ||
    normalized.includes('thời tiết') ||
    normalized.includes('nấu ăn') ||
    normalized.includes('cách làm bánh') ||
    normalized.includes('viết thơ') ||
    normalized.includes('viết code') ||
    normalized.includes('lập trình') ||
    normalized.includes('tổng thống') ||
    normalized.includes('thủ tướng') ||
    normalized.includes('chính trị') ||
    normalized.includes('chiến tranh') ||
    normalized.includes('bóng đá') ||
    normalized.includes('xổ số') ||
    normalized.includes('hôm nay ăn gì') ||
    normalized.includes('mấy giờ rồi') ||
    normalized.includes('tình yêu') ||
    normalized.includes('tâm sự')

  if (!isBotIdentity && (isThirdPartyOrExternal || isMathOrTrivia)) {
    intent.isOutOfScope = true
    intent.isPolicy = false
  }

  // 14. Phát hiện các dòng máy / thương hiệu KHÔNG kinh doanh tại CloudPhone
  const unsupportedList = [
    { name: 'Nokia', regex: /\bnokia/i },
    { name: 'Bphone (Bkav)', regex: /\b(bphone|bkav)/i },
    { name: 'Sony Xperia', regex: /\b(sony|xperia)/i },
    { name: 'Huawei / Honor', regex: /\b(huawei|honor)/i },
    { name: 'HTC', regex: /\bhtc/i },
    { name: 'BlackBerry', regex: /\bblackberry/i },
    { name: 'Motorola', regex: /\b(motorola|moto\s)/i },
    { name: 'Vertu', regex: /\bvertu/i },
    { name: 'LG', regex: /\blg\s*(v\d+|g\d+|velvet|wing)?\b/i },
    { name: 'Điện thoại phổ thông / Cục gạch', regex: /\b(cục gạch|phím bấm|bàn phím|máy cỏ)\b/i },
    { name: 'Poco F5 / Poco đời cũ', regex: /\bpoco\s*(?:f\s*[1-5]|x\s*[1-6]|m\s*[1-6]|c\s*\d+)\b/i },
    { name: 'Redmi / Redmi Note', regex: /\bredmi/i },
    { name: 'Xiaomi đời cũ', regex: /\b(?:xiaomi|mi)\s*(?:[1-9]|1[0-3])\b/i },
    { name: 'Galaxy A đời cũ', regex: /\b(?:galaxy\s*a|a\s*)(?:[0-4]\d|5[0-4]|7\d)\b/i },
    { name: 'iPhone đời cũ (iPhone 11/12/X/8/7/6)', regex: /\biphone\s*(?:[345678]|11|12|x|xs|xr)\b/i },
    { name: 'Galaxy Note', regex: /\b(galaxy\s*note|note\s*(?:10|20))\b/i },
    { name: 'Galaxy S đời cũ (S20/S21/S22/S23)', regex: /\b(galaxy\s*s2[0-3]|s2[0-3]\b)/i },
  ]

  for (const item of unsupportedList) {
    const match = normalized.match(item.regex)
    if (match) {
      let detectedName = item.name
      if (
        item.name.includes('Poco') ||
        item.name.includes('iPhone') ||
        item.name.includes('Galaxy') ||
        item.name.includes('Nokia') ||
        item.name.includes('Xiaomi')
      ) {
        const rawModel = match[0].trim()
        detectedName = rawModel
          .replace(/poco\s*f\s*(\d+)/i, 'Poco F$1')
          .replace(/poco\s*x\s*(\d+)/i, 'Poco X$1')
          .replace(/poco\s*m\s*(\d+)/i, 'Poco M$1')
          .replace(/iphone\s*(\d+)/i, 'iPhone $1')
          .replace(/samsung\s*s\s*(\d+)/i, 'Samsung Galaxy S$1')
          .replace(/galaxy\s*s\s*(\d+)/i, 'Samsung Galaxy S$1')
          .replace(/s\s*23/i, 'Galaxy S23')
          .replace(/nokia\s*(\d+)/i, 'Nokia $1')
          .replace(/nokia/i, 'Nokia')
          .replace(/\b([a-z])/g, (m) => m.toUpperCase())
      }
      intent.unsupportedModel = detectedName
      // Xóa brandPreference để AI không bị kích hoạt tư vấn tràn lan thương hiệu
      intent.brandPreference = undefined
      break
    }
  }

  // 15. Kiểm tra ý định hỏi ưu nhược điểm / có nên mua / đánh giá
  if (
    normalized.includes('ưu nhược điểm') ||
    normalized.includes('ưu điểm') ||
    normalized.includes('nhược điểm') ||
    normalized.includes('điểm mạnh') ||
    normalized.includes('điểm yếu') ||
    normalized.includes('có nên mua') ||
    normalized.includes('nên mua không') ||
    normalized.includes('đáng mua không') ||
    normalized.includes('đánh giá') ||
    normalized.includes('review') ||
    normalized.includes('có tốt không') ||
    normalized.includes('dùng tốt không') ||
    normalized.includes('dùng mượt không') ||
    normalized.includes('có mượt không') ||
    normalized.includes('có ngon không')
  ) {
    intent.wantsProsCons = true
  }

  // 16. Kiểm tra ý định hỏi giá
  if (
    normalized.includes('giá bao nhiêu') ||
    normalized.includes('bao nhiêu tiền') ||
    normalized.includes('bao tiền') ||
    normalized.includes('giá thế nào') ||
    normalized.includes('giá bn') ||
    normalized.includes('mấy triệu') ||
    normalized.includes('nhiêu tiền')
  ) {
    intent.wantsPriceCheck = true
  }

  // 17. Nhận diện đích danh dòng máy cụ thể trong kho CloudPhone
  // Sắp xếp thứ tự ưu tiên: chuỗi cụ thể hơn xếp trước để không bị bắt nhầm
  const specificCatalogModels: { name: string; pattern: RegExp }[] = [
    // Apple
    { name: 'iPhone 18 Pro Max 256GB', pattern: /\b(?:iphone|ip)?\s*18\s*(?:pro\s*max|promax|pm)\b/i },
    { name: 'iPhone 18 Pro 256GB', pattern: /\b(?:iphone|ip)?\s*18\s*pro(?!\s*max|\s*promax|\s*pm)\b/i },
    { name: 'iPhone 18 Pro Max 256GB', pattern: /\b(?:iphone|ip)\s*18(?!\s*pro)\b/i },
    { name: 'iPhone Duo 256GB', pattern: /\b(?:iphone|ip|apple)?\s*duo\b/i },
    { name: 'iPhone 16 Pro Max 256GB', pattern: /\b(?:iphone|ip)?\s*16\s*(?:pro\s*max|promax|pm)\b/i },
    { name: 'iPhone 15 128GB', pattern: /\b(?:iphone|ip)?\s*15(?!\s*pro)\b/i },
    { name: 'iPhone 13 128GB', pattern: /\b(?:iphone|ip)?\s*13(?!\s*pro)\b/i },

    // Samsung
    { name: 'Samsung Galaxy S26 Ultra 5G 256GB', pattern: /\b(?:galaxy|samsung|ss)?\s*s\s*26\s*ultra\b/i },
    { name: 'Samsung Galaxy S26 5G 256GB', pattern: /\b(?:galaxy|samsung|ss)?\s*s\s*26(?!\s*ultra)\b/i },
    { name: 'Samsung Galaxy Z Fold8 5G 256GB', pattern: /\b(?:galaxy|samsung|ss|z)?\s*fold\s*8\b/i },
    { name: 'Samsung Galaxy Z Flip6 5G 256GB', pattern: /\b(?:galaxy|samsung|ss|z)?\s*flip\s*6\b/i },
    { name: 'Samsung Galaxy S24 Ultra 5G', pattern: /\b(?:galaxy|samsung|ss)?\s*s\s*24\s*ultra\b/i },
    { name: 'Samsung Galaxy A55 5G', pattern: /\b(?:galaxy|samsung|ss)?\s*a\s*55\b/i },

    // Xiaomi & Poco
    { name: 'Xiaomi 17 Ultra 5G 16GB/512GB', pattern: /\b(?:xiaomi|mi)?\s*17\s*ultra\b/i },
    { name: 'Xiaomi 17T Pro 5G 12GB/256GB', pattern: /\b(?:xiaomi|mi)?\s*17\s*t(?:\s*pro)?\b/i },
    { name: 'Xiaomi 14 Ultra 5G', pattern: /\b(?:xiaomi|mi)?\s*14\s*ultra\b/i },
    { name: 'Poco F6 Pro 5G', pattern: /\b(?:poco)?\s*f\s*6(?:\s*pro)?\b/i },

    // Vivo
    { name: 'vivo X300 Ultra 5G 16GB/512GB', pattern: /\b(?:vivo)?\s*x\s*300(?:\s*ultra)?\b/i },
    { name: 'Vivo X100 Pro 5G', pattern: /\b(?:vivo)?\s*x\s*100(?:\s*pro)?\b/i },

    // OPPO
    { name: 'OPPO Find X9 Pro 5G 16GB/512GB', pattern: /\b(?:oppo)?\s*(?:find\s*)?x\s*9(?:\s*pro)?\b/i },
    { name: 'OPPO Reno12 Pro 5G', pattern: /\b(?:oppo)?\s*reno\s*12(?:\s*pro)?\b/i },

    // realme
    { name: 'realme GT8 Pro 5G 16GB/512GB', pattern: /\b(?:realme)?\s*gt\s*8(?:\s*pro)?\b/i },
    { name: 'realme 16T 5G 8GB/128GB', pattern: /\b(?:realme)?\s*16\s*t\b/i },

    // ASUS & Google
    { name: 'ASUS ROG Phone 8 Pro', pattern: /\b(?:asus\s*)?rog(?:\s*phone)?(?:\s*8|\s*8\s*pro)?\b/i },
    { name: 'Google Pixel 9 Pro XL', pattern: /\b(?:google\s*)?pixel\s*9(?:\s*pro\s*xl|\s*pro|\s*xl)?\b/i },
  ]

  const matchedModels: string[] = []
  for (const item of specificCatalogModels) {
    if (item.pattern.test(normalized)) {
      if (!matchedModels.includes(item.name)) {
        matchedModels.push(item.name)
      }
    }
  }

  if (matchedModels.length === 1) {
    intent.specificModel = matchedModels[0]
  } else if (matchedModels.length > 1) {
    intent.isComparison = true
  }

  // 18. Hãng ưa chuộng
  if (normalized.includes('iphone') || normalized.includes('apple') || normalized.includes('ios')) {
    intent.brandPreference = 'Apple'
  } else if (normalized.includes('samsung') || normalized.includes('galaxy')) {
    intent.brandPreference = 'Samsung'
  } else if (normalized.includes('xiaomi') || normalized.includes('poco') || normalized.includes('redmi')) {
    intent.brandPreference = 'Xiaomi'
  } else if (normalized.includes('realme')) {
    intent.brandPreference = 'Realme'
  } else if (normalized.includes('oppo') || normalized.includes('reno')) {
    intent.brandPreference = 'OPPO'
  } else if (normalized.includes('vivo')) {
    intent.brandPreference = 'Vivo'
  } else if (normalized.includes('google') || normalized.includes('pixel')) {
    intent.brandPreference = 'Google'
  } else if (normalized.includes('asus') || normalized.includes('rog')) {
    intent.brandPreference = 'Asus'
  }

  // 19. Kiểm tra câu hỏi Mua / Tìm / Tra cứu dòng máy cụ thể
  // Xử lý các dạng: "toi muốn mua poco f5", "cần mua s23", "tìm mua poco f5", "mua nokia 1280", "có poco f5 không", "bán poco f5 không"
  const isAdviceOrReviewLead = /^(?:tư vấn|cho hỏi|hỏi về|đánh giá|review|so sánh|thông số|giá)\b/i.test(normalized)
  const isReviewWord = /(?:ưu nhược điểm|ưu điểm|nhược điểm|nên mua|đáng mua|tốt không|mượt|quay phim|bao nhiêu|bao tiền|mấy triệu|trả góp|bảo hành|đổi trả|khuyến mãi|thế nào|ra sao|ở đâu|có nên)/i.test(normalized)

  if (
    !intent.specificModel &&
    !intent.isComparison &&
    !intent.isPolicy &&
    !intent.wantsProsCons &&
    !intent.wantsPriceCheck &&
    !isAdviceOrReviewLead &&
    !isReviewWord
  ) {
    // 19.1. Khách nói trực tiếp muốn mua/tìm mua/mua máy
    const purchaseMatch = normalized.match(
      /^(?:tôi|tao|mình|em|anh|chị|khách|toi)?\s*(?:muốn mua|cần mua|tìm mua|hỏi mua|muốn tìm|cần tìm|mua|tìm|cho mua|xem mua)\s+(?:con\s+|máy\s+|đt\s+|điện thoại\s+|dòng\s+|chiếc\s+)?([^?.,!]+?)(?:\s+(?:không|k|ko|hông|được không|ạ|\?))*$/i
    )

    // 19.2. Khách hỏi tồn kho: "có [X] không", "bán [X] không", "còn [X] không"
    const availMatch = normalized.match(
      /^(?:shop\s+|bên mình\s+|ad\s+|bix\s+)?(?:có|bán|còn)\s+(?:bán\s+)?(?:máy\s+|đt\s+|điện thoại\s+|dòng\s+|chiếc\s+)?([^?.,!]+?)(?:\s+(?:không|k|ko|hông|được không|ạ|\?))*$/i
    )

    let candidateRaw: string | undefined
    if (purchaseMatch) {
      candidateRaw = purchaseMatch[1].trim()
    } else if (availMatch) {
      candidateRaw = availMatch[1].trim()
    }

    if (candidateRaw) {
      const candidate = candidateRaw.replace(/^(?:con|máy|chiếc|dòng|bán|có)\s+/i, '').trim()
      const isMoney = /\d+\s*(?:triệu|tr|củ|k|đ)/i.test(candidate)
      const isGeneralNeed = /^(chụp ảnh|quay phim|chơi game|pin trâu|pin khủng|gập|giá rẻ|máy nào|gì|hàng|sản phẩm|ưu đãi|khuyến mãi|học tập|làm việc|văn phòng)/i.test(candidate)
      const bareBrands = ['iphone', 'apple', 'samsung', 'galaxy', 'xiaomi', 'mi', 'oppo', 'vivo', 'realme', 'asus', 'google', 'pixel']
      const isBareBrand = bareBrands.includes(candidate) || bareBrands.map((b) => 'điện thoại ' + b).includes(candidate) || bareBrands.map((b) => 'máy ' + b).includes(candidate)

      if (!isMoney && !isGeneralNeed && !isBareBrand && candidate.length >= 2) {
        // Kiểm tra xem candidate có khớp với máy nào trong kho 24 sản phẩm không
        let inCatalog = false
        for (const item of specificCatalogModels) {
          if (item.pattern.test(candidate)) {
            intent.specificModel = item.name
            inCatalog = true
            break
          }
        }

        if (!inCatalog) {
          intent.isAvailabilityCheck = true
          // Format tên máy sạch sẽ
          const displayTarget = candidate
            .replace(/poco\s*f\s*(\d+)/i, 'Poco F$1')
            .replace(/poco\s*x\s*(\d+)/i, 'Poco X$1')
            .replace(/poco\s*m\s*(\d+)/i, 'Poco M$1')
            .replace(/iphone\s*(\d+)/i, 'iPhone $1')
            .replace(/samsung\s*s\s*(\d+)/i, 'Samsung Galaxy S$1')
            .replace(/redmi\s*note\s*(\d+)/i, 'Redmi Note $1')
            .replace(/nokia\s*(\d+)/i, 'Nokia $1')
            .replace(/\b([a-z])/g, (m) => m.toUpperCase())

          intent.availabilityTarget = displayTarget
          // QUAN TRỌNG: Hủy brandPreference để AI không tư vấn tràn lan thương hiệu khi máy không có trong kho!
          intent.brandPreference = undefined
        }
      }
    }
  }

  return intent
}

// 2. Chấm điểm từng sản phẩm dựa trên nhu cầu (Scoring & Ranking)
export function scoreAndRankProducts(products: Product[], intent: ExtractedIntent): ScoredProduct[] {
  const scoredList: ScoredProduct[] = products.map((p) => {
    let score = 50
    const reasons: string[] = []
    const tradeOffs: string[] = []

    const nameLower = p.name.toLowerCase()
    const descLower = p.description.toLowerCase()
    const chipLower = p.chip.toLowerCase()
    const screenLower = p.screen.toLowerCase()
    const tagLower = p.tag.toLowerCase()
    const batteryLower = p.battery.toLowerCase()

    // Nếu khách hỏi đích danh 1 dòng máy cụ thể
    if (intent.specificModel && !intent.isComparison) {
      const targetLower = intent.specificModel.toLowerCase()
      if (nameLower === targetLower || nameLower.includes(targetLower) || targetLower.includes(nameLower)) {
        score += 50000
        reasons.push(`Đúng chính xác mẫu máy bạn đang tìm kiếm: ${p.name}`)
      } else {
        score -= 20000
      }
    }

    // Trích xuất dung lượng pin dạng số (mAh)
    const batteryMatch = p.battery.match(/(\d{4})\s*mah/i)
    const batteryMah = batteryMatch ? parseInt(batteryMatch[1], 10) : 4500

    // --- Xử lý ngân sách nghiêm ngặt ---
    if (intent.maxBudget) {
      if (p.price > intent.maxBudget * 1.05) {
        // Vượt quá ngân sách: loại trừ hoặc phạt cực nặng
        score -= 10000
        tradeOffs.push(`Vượt quá ngân sách dự kiến (${formatVnd(p.price)} so với mức ${formatVnd(intent.maxBudget)})`)
      } else {
        score += 80
        reasons.push(`Nằm trong tầm ngân sách phù hợp (${formatVnd(p.price)})`)
      }
    }

    if (intent.minBudget && p.price < intent.minBudget * 0.75) {
      score -= 300
    }

    // Nếu hỏi "trong tầm giá" / value for money
    if (intent.isValueForMoney) {
      if (nameLower.includes('gt8 pro') || nameLower.includes('poco f6 pro') || nameLower.includes('17t pro')) {
        score += 60
        reasons.push('Tỉ lệ cấu hình trên giá thành (P/P) cực kỳ ấn tượng')
      }
      if (nameLower.includes('a55') || nameLower.includes('16t')) {
        score += 40
        reasons.push('Mức giá dễ tiếp cận, đáp ứng bền bỉ')
      }
    }

    // --- A. Chụp ảnh ---
    if (intent.wantsPhoto) {
      if (nameLower.includes('17 ultra')) {
        score += 180
        reasons.push('Cảm biến chính 1 inch LYT-900, hệ thống camera Leica Summilux và camera tele 200MP chuyên sâu')
        tradeOffs.push('Cụm camera lồi đáng kể và thân máy đầm tay')
      } else if (nameLower.includes('x300 ultra')) {
        score += 175
        reasons.push('Hệ thống camera ZEISS 200MP chống rung Gimbal độ phân giải siêu cao')
        tradeOffs.push('Mức giá thuộc phân khúc cao cấp (35.99 triệu)')
      } else if (nameLower.includes('s26 ultra') || nameLower.includes('s24 ultra')) {
        score += 165
        reasons.push('Camera 200MP đa năng, zoom mắt thần 100x và thuật toán xử lý ảnh thông minh')
        tradeOffs.push('Thiết kế máy vuông vức và kích thước lớn')
      } else if (nameLower.includes('find x9 pro')) {
        score += 160
        reasons.push('Camera tele 200MP kết hợp tinh chỉnh màu sắc chân dung Hasselblad')
        tradeOffs.push('Thiết kế màn hình lớn 6.78 inch')
      } else if (nameLower.includes('18 pro max') || nameLower.includes('18 pro')) {
        score += 155
        reasons.push('Camera Pro Fusion sắc nét, màu sắc tự nhiên và tương thích tốt mọi ứng dụng')
        tradeOffs.push('Thiên về quay video và tính chân thực hơn là các bộ lọc màu nghệ thuật chuyên sâu')
      } else if (nameLower.includes('16 pro max')) {
        score += 140
        reasons.push('Camera zoom 5x, nút điều khiển camera chuyên nghiệp')
      } else if (nameLower.includes('14 ultra')) {
        score += 130
        reasons.push('Hệ thống 4 camera Leica cảm biến 1 inch với giá thấp hơn Xiaomi 17 Ultra')
      } else if (nameLower.includes('x100 pro')) {
        score += intent.maxBudget && intent.maxBudget <= 21_000_000 ? 140 : 85
        reasons.push('Camera ZEISS cùng chip xử lý hình ảnh Vivo V3 tối ưu chụp đêm, giá dưới 20 triệu')
        tradeOffs.push('Là model thế hệ trước so với X300 Ultra')
      } else if (nameLower.includes('reno12 pro')) {
        score += intent.maxBudget && intent.maxBudget <= 17_000_000 ? 130 : 60
        reasons.push('Chuyên gia chụp ảnh chân dung tích hợp tính năng AI Eraser thông minh')
        tradeOffs.push('Hiệu năng chip Dimensity 7300-Energy ở mức tầm trung')
      } else if (descLower.includes('camera') || tagLower.includes('camera')) {
        score += 30
      }
    }

    // --- B. Quay phim (Video / TikTok / Vlog / YouTube) ---
    if (intent.wantsVideo) {
      if (nameLower.includes('18 pro max')) {
        score += 160
        reasons.push('Khả năng quay video Pro Fusion 48MP tùy chỉnh khẩu độ, chống rung hàng đầu và tối ưu tốt nhất cho TikTok/Vlog')
        tradeOffs.push('Mức giá thuộc phân khúc cao nhất (41.99 triệu)')
      } else if (nameLower.includes('18 pro')) {
        score += 150
        reasons.push('Hiệu năng quay video chuyên nghiệp từ chip A20 Pro trong thân máy 6.3 inch gọn gàng')
        tradeOffs.push('Màn hình nhỏ hơn bản Pro Max, thời lượng pin tối ưu vừa phải')
      } else if (nameLower.includes('16 pro max')) {
        score += 135
        reasons.push('Nút điều khiển Camera Control chuyên dụng, chống rung ổn định và màu video nhất quán')
        tradeOffs.push('Dù giá tốt hơn iPhone 18 Pro Max nhưng vẫn ở mức cao (34.99 triệu)')
      } else if (nameLower.includes('iphone 15') || nameLower.includes('iphone 13')) {
        score += 110
        reasons.push('Hệ điều hành iOS tối ưu thuật toán quay video mượt mà trên TikTok/Instagram với chi phí tiết kiệm')
        tradeOffs.push('Không có ống kính tele chuyên dụng và giới hạn tần số quét màn hình 60Hz')
      } else if (nameLower.includes('17 ultra')) {
        score += 105
        reasons.push('Hệ màu Leica điện ảnh và khả năng zoom tele 200MP đa dạng tiêu cự khi quay phim')
        tradeOffs.push('Video trên ứng dụng bên thứ ba (như TikTok) đôi khi không tối ưu bằng iOS')
      } else if (nameLower.includes('x300 ultra')) {
        score += 100
        reasons.push('Độ phân giải video cao và hệ thống chống rung ZEISS tiên tiến')
        tradeOffs.push('Tập trung nhiều vào ảnh tĩnh hơn là các công cụ biên tập video nhanh')
      }
    }

    // --- C. Chơi game và hiệu năng ---
    if (intent.wantsGaming) {
      if (nameLower.includes('rog phone 8 pro')) {
        score += 150
        reasons.push('Thiết kế thuần gaming với phím siêu âm AirTrigger, màn hình 165Hz siêu mượt và hệ thống tản nhiệt buồng hơi')
        tradeOffs.push('Thiết kế hầm hố, trọng lượng nặng và giá thành cao (28.99 triệu)')
      } else if (nameLower.includes('gt8 pro')) {
        score += 145
        reasons.push('Trang bị Snapdragon 8 Elite Gen 5, màn hình 2K 144Hz, pin 7000mAh sạc nhanh 120W với mức giá rất hấp dẫn')
        tradeOffs.push('Đây là phiên bản xách tay, cần lưu ý về chính sách cập nhật ROM và thông báo')
      } else if (nameLower.includes('17t pro')) {
        score += 135
        reasons.push('Chip Dimensity 9500 thế hệ mới, màn hình 144Hz cùng viên pin lớn 7000mAh sạc siêu tốc 100W')
        tradeOffs.push('Cụm camera thiên về đa dụng hơn là cảm biến 1 inch chuyên sâu')
      } else if (nameLower.includes('poco f6 pro')) {
        score += 130
        reasons.push('Snapdragon 8 Gen 2, màn hình 2K 120Hz và sạc siêu tốc 120W (đầy trong 19 phút) với giá chỉ hơn 12 triệu')
        tradeOffs.push('Khả năng chụp ảnh ở mức vừa phải, thân máy nóng khi chiến game nặng kéo dài')
      } else if (chipLower.includes('snapdragon 8 elite') || chipLower.includes('a20 pro')) {
        score += 70
        reasons.push('Chipset đầu bảng xử lý mượt mà mọi tựa game nặng')
      } else if (chipLower.includes('dimensity 9500') || chipLower.includes('snapdragon 8 gen 3')) {
        score += 55
        reasons.push('Hiệu năng xử lý đồ họa mạnh mẽ')
      }

      // Bonus tần số quét màn hình
      if (screenLower.includes('165hz')) score += 30
      else if (screenLower.includes('144hz')) score += 20
      else if (screenLower.includes('120hz')) score += 10
    }

    // --- D. Pin trâu và thời lượng sử dụng ---
    if (intent.wantsBattery) {
      if (nameLower.includes('16t')) {
        score += 150
        reasons.push('Dung lượng pin Titan 8000mAh lớn nhất trong danh mục sản phẩm, sạc nhanh 45W')
        tradeOffs.push('Sử dụng màn hình LCD và chip Dimensity 6300 chỉ thích hợp chơi game nhẹ hoặc tác vụ hằng ngày')
      } else if (nameLower.includes('find x9 pro')) {
        score += 130
        reasons.push('Viên pin khủng 7500mAh kết hợp sạc nhanh 80W trên một flagship cao cấp')
        tradeOffs.push('Thân máy dày dặn và trọng lượng đầm')
      } else if (nameLower.includes('gt8 pro')) {
        score += 125
        reasons.push('Viên pin Titan 7000mAh kết hợp công nghệ sạc siêu tốc 120W')
        tradeOffs.push('Bản xách tay, màn hình 2K 144Hz tiêu thụ nhiều điện nếu bật độ sáng tối đa')
      } else if (nameLower.includes('17t pro')) {
        score += 120
        reasons.push('Pin 7000mAh kèm củ sạc nhanh 100W, thời gian nạp lại pin rất nhanh')
        tradeOffs.push('Màn hình 6.83 inch kích thước lớn')
      } else if (batteryMah >= 6000) {
        score += 70
        reasons.push(`Dung lượng pin lớn ${batteryMah}mAh`)
      } else if (batteryMah >= 5000) {
        score += 30
      } else if (batteryMah < 4500) {
        score -= 40
        tradeOffs.push(`Dung lượng pin ${p.battery} ở mức vừa phải`)
      }

      // Nếu KHÁCH VỪA HỎI PIN TRÂU VỪA CHƠI GAME:
      if (intent.wantsGaming) {
        if (nameLower.includes('gt8 pro') || nameLower.includes('17t pro')) {
          score += 60 // Tối ưu hoàn hảo cả pin lẫn game nặng
        }
        if (nameLower.includes('16t')) {
          score -= 70 // 8000mAh nhưng chip Dimensity 6300 không gánh nổi game nặng nhiều!
          tradeOffs.push('Chip Dimensity 6300 không phù hợp để cày game nặng FPS cao thường xuyên')
        }
      }
    }

    // --- E. Điện thoại gập (Foldable) ---
    if (intent.wantsFoldable) {
      if (nameLower.includes('z fold8')) {
        score += 160
        reasons.push('Thiết kế gập dạng quyển sách 7.6 inch đa nhiệm xuất sắc, chip Snapdragon 8 Elite và nền tảng One UI gập hoàn thiện')
        tradeOffs.push('Mức giá cao (46.99 triệu) và kích thước khi gập dày hơn điện thoại thông thường')
      } else if (nameLower.includes('iphone duo')) {
        score += 140
        reasons.push('Siêu phẩm gập đầu tiên của Apple với khung viền titan sang trọng, chip A20 Pro và màn hình OLED trong 7.6 inch')
        tradeOffs.push('Mức giá cao kỷ lục (64.999 triệu), là thế hệ gập đầu tiên của Apple')
      } else if (nameLower.includes('z flip6')) {
        score += 130
        reasons.push('Thiết kế gập vỏ sò nhỏ gọn bỏ túi, thời trang, FlexCam chụp ảnh linh hoạt với mức giá dễ tiếp cận hơn (21.99 triệu)')
        tradeOffs.push('Viên pin 4000mAh ở mức khiêm tốn, không phục vụ đa nhiệm màn hình lớn')
      } else {
        score -= 5000 // Không phải máy gập thì loại trừ
      }
    }

    // --- F. AI & Học tập, làm việc ---
    if (intent.wantsAI || intent.wantsWorkStudy) {
      if (nameLower.includes('s26 ultra') || nameLower.includes('s24 ultra')) {
        score += 90
        reasons.push('Bút S Pen tích hợp ghi chú tiện lợi cùng bộ công cụ Galaxy AI hỗ trợ dịch thuật, tóm tắt văn bản')
        tradeOffs.push('Kích thước máy vuông vức và mức giá cao')
      } else if (nameLower.includes('s26 5g')) {
        score += 95
        reasons.push('Kích thước 6.3 inch nhỏ gọn, tích hợp trọn vẹn các tính năng Galaxy AI phục vụ công việc và học tập hằng ngày')
        tradeOffs.push('Dung lượng pin 4300mAh ở mức vừa đủ dùng cho một ngày')
      } else if (nameLower.includes('pixel 9 pro xl')) {
        score += 95
        reasons.push('Tích hợp Gemini AI thông minh từ Google, hệ điều hành Android thuần mượt mà và cam kết cập nhật 7 năm')
        tradeOffs.push('Chip Tensor G4 tập trung vào trí tuệ nhân tạo hơn là tối ưu game nặng')
      } else if (nameLower.includes('iphone 15') || nameLower.includes('iphone 13')) {
        score += 85
        reasons.push('Hệ điều hành iOS ổn định, bền bỉ qua nhiều năm, hỗ trợ đắc lực việc học tập và ứng dụng văn phòng')
        tradeOffs.push('Màn hình tần số quét 60Hz truyền thống')
      } else if (nameLower.includes('galaxy a55')) {
        score += 85
        reasons.push('Mức giá dưới 10 triệu, màn hình Super AMOLED 120Hz đẹp, pin 5000mAh và bảo mật Knox an toàn')
        tradeOffs.push('Chip Exynos 1480 và sạc 25W ở mức cơ bản')
      }
    }

    // --- Kích thước nhỏ gọn ---
    if (intent.wantsCompact) {
      if (screenLower.includes('6.1"') || screenLower.includes('6.3"') || nameLower.includes('flip6')) {
        score += 80
        reasons.push('Kích thước nhỏ gọn, cầm nắm vừa vặn một tay dễ dàng bỏ túi')
      } else if (screenLower.includes('6.8"') || screenLower.includes('6.9"')) {
        score -= 60
        tradeOffs.push('Màn hình lớn trên 6.8 inch có thể gây bất tiện khi dùng một tay')
      }
    }

    // --- Hãng ưa thích ---
    if (intent.brandPreference) {
      if (p.brand.toLowerCase() === intent.brandPreference.toLowerCase()) {
        score += 45
        reasons.push(`Thuộc thương hiệu ${p.brand} đúng với mong muốn`)
      }
    }

    // --- Câu hỏi siêu cấp / ngon nhất / tốt nhất / đỉnh nhất ---
    if (intent.isSuperlative) {
      if (intent.wantsGaming) {
        // Gaming: Ưu tiên máy gaming chuyên dụng & chip đồ hoạ cao cấp
        if (nameLower.includes('rog') || nameLower.includes('gt8') || nameLower.includes('17t pro')) {
          score += 50
        }
      } else if (intent.wantsBattery) {
        // Pin trâu: Ưu tiên máy pin khủng 7000 - 8000mAh
        if (nameLower.includes('16t') || nameLower.includes('find x9') || nameLower.includes('gt8')) {
          score += 50
        }
      } else {
        // Chụp ảnh hoặc câu hỏi chung: Ưu tiên flagship đầu bảng
        if (p.price >= 30_000_000) {
          score += 40
        } else if (p.price < 22_000_000) {
          score -= 40
        }
      }
    }

    return {
      product: p,
      score,
      reasons,
      tradeOffs,
    }
  })

  // Sắp xếp điểm giảm dần
  return scoredList.sort((a, b) => b.score - a.score)
}

// 3. Helper tạo câu trả lời chuyên sâu cho 1 dòng máy cụ thể
export function buildSingleModelAdvice(
  p: Product,
  intent: ExtractedIntent
): ChatResponse {
  const savings = p.original_price && p.original_price > p.price ? p.original_price - p.price : 0


  // Trường hợp 1: Hỏi ưu nhược điểm / có nên mua không / review / đánh giá
  if (intent.wantsProsCons) {
    const pros: string[] = []
    const cons: string[] = []

    // --- Phân tích ưu điểm dựa trên cấu hình thật ---
    pros.push(`**Hiệu năng cực đỉnh:** Trang bị vi xử lý **${p.chip}** cùng bộ nhớ **${p.ram_rom}**, xử lý siêu tốc mọi tác vụ, đa nhiệm mượt mà và cân tối đa đồ họa game nặng.`)
    pros.push(`**Màn hình hiển thị xuất sắc:** Tấm nền **${p.screen}** mang lại màu sắc rực rỡ, độ chi tiết cao và độ phản hồi cảm ứng nhạy bén.`)
    pros.push(`**Thời lượng Pin & Sạc ấn tượng:** **${p.battery}** đảm bảo trải nghiệm liên tục suốt ngày dài.`)
    pros.push(`**Hệ thống Camera chuyên nghiệp:** **${p.camera}** ghi lại hình ảnh sắc nét, màu sắc chân thực và chống rung tốt.`)

    // Ưu điểm đặc thù theo model
    const pNameLower = p.name.toLowerCase()
    if (pNameLower.includes('gt8 pro')) {
      pros.push(`**Tỉ lệ P/P (Hiệu năng trên giá thành) vô địch:** Trong tầm giá ${formatVnd(p.price)}, hiếm chiếc máy nào sở hữu chip Snapdragon 8 Elite Gen 5 cùng pin Titan 7000 mAh và sạc 120W.`)
      pros.push(`**Bộ lọc màu nghệ thuật RICOH GR:** Cảm biến 50MP Sony IMX906 OIS và ống kính tele tiềm vọng 3x OIS mang lại chất ảnh đường phố ấn tượng.`)
    } else if (pNameLower.includes('18 pro max') || pNameLower.includes('18 pro')) {
      pros.push(`**Hệ sinh thái Apple đỉnh cao:** Chip A20 Pro tối ưu cực mượt, camera Pro Fusion có khẩu độ tùy chỉnh và khả năng quay video TikTok/Vlog tốt nhất thị trường.`)
    } else if (pNameLower.includes('duo')) {
      pros.push(`**Đột phá gập đa nhiệm:** Màn hình OLED trong 7.6 inch rộng rãi phục vụ công việc và màn hình ngoài 5.4 inch nhỏ gọn, khung titan nguyên khối đẳng cấp.`)
    } else if (pNameLower.includes('s26 ultra') || pNameLower.includes('s24 ultra')) {
      pros.push(`**Quyền năng Galaxy AI & Bút S-Pen:** Camera 200MP zoom mắt thần 100x và bút S-Pen tích hợp cho trải nghiệm làm việc thông minh hàng đầu.`)
    } else if (pNameLower.includes('17 ultra') || pNameLower.includes('14 ultra')) {
      pros.push(`**Chất ảnh Leica cơ khí:** Cảm biến 1 inch LYT-900 cùng hệ thống quang học Leica Summilux và tele tiềm vọng 200MP zoom quang siêu xa.`)
    } else if (pNameLower.includes('x300 ultra') || pNameLower.includes('x100 pro')) {
      pros.push(`**Chuyên gia chụp ảnh ZEISS:** Hệ thấu kính ZEISS T* tráng phủ chống lóa, cảm biến 1 inch và chống rung Gimbal đỉnh cao.`)
    } else if (pNameLower.includes('find x9 pro')) {
      pros.push(`**Màu sắc chân dung Hasselblad:** Cảm biến 50MP 1/1.28 inch, tele tiềm vọng 200MP và viên pin cực đại 7500 mAh.`)
    } else if (pNameLower.includes('rog')) {
      pros.push(`**Quái vật gaming thuần chủng:** Màn hình 165Hz siêu tốc, phím siêu âm AirTrigger và hệ thống tản nhiệt buồng hơi chuyên dụng.`)
    } else if (pNameLower.includes('16t')) {
      pros.push(`**Pin Titan 8000 mAh bền bỉ:** Dung lượng pin lớn nhất thị trường hiện nay, dùng 2 - 3 ngày thoải mái.`)
    } else if (pNameLower.includes('a55')) {
      pros.push(`**Toàn diện phân khúc tầm trung:** Khung viền kim loại cao cấp, kháng nước chuẩn IP67 và bảo mật Knox Vault chính hãng.`)
    }

    // --- Phân tích nhược điểm & điểm cần cân nhắc ---
    if (pNameLower.includes('gt8 pro')) {
      cons.push(`**Phiên bản xách tay cao cấp:** Máy phân phối bản xách tay (CloudPhone bảo hành 12 tháng, 1 đổi 1 trong 30 ngày), người dùng cần kiểm tra cài đặt thông báo và ứng dụng ban đầu.`)
      cons.push(`**Camera góc siêu rộng:** Ống kính góc siêu rộng 8MP ở mức tiêu chuẩn, chưa đỉnh cao bằng camera chính và camera tele tiềm vọng.`)
      cons.push(`**Thân máy đầm tay:** Do chứa viên pin lớn 7000 mAh nên khi cầm máy lâu bằng một tay sẽ có cảm giác hơi đầm.`)
    } else if (pNameLower.includes('18 pro') || pNameLower.includes('18 pro max') || pNameLower.includes('duo')) {
      cons.push(`**Mức giá cao cấp:** Chi phí đầu tư ban đầu thuộc phân khúc cao nhất hiện nay.`)
      cons.push(`**Tốc độ sạc:** Công suất sạc 45W tiêu chuẩn Apple, chưa siêu tốc như sạc 90W-120W của một số đối thủ Android.`)
    } else if (pNameLower.includes('13') || pNameLower.includes('15')) {
      cons.push(`**Tần số quét 60Hz:** Màn hình vẫn ở mức 60Hz truyền thống, chưa có 120Hz ProMotion mượt mà.`)
      cons.push(`**Thiếu camera tele:** Không trang bị ống kính tele tiềm vọng để zoom xa quang học sắc nét.`)
    } else if (pNameLower.includes('fold') || pNameLower.includes('flip')) {
      cons.push(`**Cơ chế màn hình gập:** Nếp gấp nhẹ giữa màn hình cần thời gian làm quen và cần bảo quản bản lề cẩn thận trước cát bụi.`)
    } else if (pNameLower.includes('ultra')) {
      cons.push(`**Cụm camera hầm hố:** Cụm camera lồi khá nhiều do chứa cảm biến lớn 1 inch và thấu kính tiềm vọng.`)
    } else if (pNameLower.includes('a55') || pNameLower.includes('16t')) {
      cons.push(`**Hiệu năng đồ họa:** Tối ưu tốt cho tác vụ thường ngày và game phổ thông, chưa phù hợp để kéo max setting game 3D nặng nề như dòng flagship.`)
    } else {
      cons.push(`**Kích thước:** Màn hình lớn cần hai tay khi thao tác trong thời gian dài.`)
    }

    // Lời khuyên có nên mua không
    let recommendation = ''
    if (pNameLower.includes('gt8 pro')) {
      recommendation =
        `👉 **RẤT NÊN MUA:** Nếu anh/chị đang tìm kiếm một chiếc smartphone có cấu hình "quái vật", pin cực trâu 7000 mAh dùng thoải mái 2 ngày, màn hình 2K 144Hz sắc nét để cày game nặng với mức giá hợp lý dưới 19 triệu.\n` +
        `👉 **CÂN NHẮC DÒNG KHÁC:** Nếu anh/chị bắt buộc phải dùng hàng chính hãng Việt Nam 100% (có thể chọn Xiaomi 17T Pro hoặc Galaxy S24 Ultra) hoặc ưu tiên quay video mạng xã hội đỉnh nhất như iPhone.`
    } else if (pNameLower.includes('iphone') || pNameLower.includes('duo')) {
      recommendation =
        `👉 **RẤT NÊN MUA:** Nếu anh/chị muốn sở hữu thiết bị cao cấp, mượt mà, giữ giá lâu dài, quay video đăng mạng xã hội đẹp nhất và gắn liền hệ sinh thái Apple.\n` +
        `👉 **CÂN NHẮC:** Nếu anh/chị cần sạc siêu nhanh 120W hoặc camera zoom tiềm vọng 100x của Android.`
    } else {
      recommendation =
        `👉 **RẤT NÊN MUA:** Nếu chiếc máy này đáp ứng đúng các tiêu chí ưu tiên cao nhất của anh/chị về camera, pin hoặc hiệu năng trong tầm ngân sách.\n` +
        `👉 **CÂN NHẮC:** Tham khảo thêm các mẫu cùng phân khúc tại CloudPhone nếu anh/chị có nhu cầu chuyên biệt khác.`
    }

    const reply =
      `Dạ em chào anh/chị! Em xin gửi phân tích chi tiết về **Ưu - Nhược điểm** và đánh giá thực tế chiếc **${p.name}** tại CloudPhone để anh/chị dễ dàng quyết định ạ:\n\n` +
      `💰 **Giá bán tại CloudPhone:** **${formatVnd(p.price)}**` +
      (savings > 0 ? ` *(Giá niêm yết ${formatVnd(p.original_price!)}, tiết kiệm ${formatVnd(savings)})*` : '') +
      `\n` +
      `🌟 **ƯU ĐIỂM NỔI BẬT (PROS):**\n` +
      pros.map((item) => `• ${item}`).join('\n') +
      `\n\n` +
      `⚠️ **NHƯỢC ĐIỂM & ĐIỂM CẦN CÂN NHẮC (CONS):**\n` +
      cons.map((item) => `• ${item}`).join('\n') +
      `\n\n` +
      `💡 **KẾT LUẬN - CÓ NÊN MUA KHÔNG?**\n` +
      recommendation +
      `\n\n` +
      `🛡️ **Chính sách bán hàng tại CloudPhone:**\n` +
      `• Cam kết máy mới 100% nguyên seal/nguyên hộp, 1 đổi 1 trong 30 ngày đầu tiên nếu có lỗi phần cứng.\n` +
      `• Bảo hành chính hãng 12 - 24 tháng, hỗ trợ kỹ thuật và phần mềm trọn đời.\n` +
      `• Giao hàng hỏa tốc trong 1-2 giờ nội thành, miễn phí ship toàn quốc.\n\n` +
      `Anh/chị có muốn đặt giữ máy trước hoặc cần em tư vấn thêm cấu hình không ạ?`

    return {
      reply,
      suggestions: [`Đặt mua ${p.name}`, 'Phương thức thanh toán', 'Chính sách bảo hành 1 đổi 1'],
      products: [p],
    }
  }

  // Trường hợp 2: Hỏi giá bán / trả góp bao nhiêu
  if (intent.wantsPriceCheck) {
    const reply =
      `Dạ em chào anh/chị! Chiếc **${p.name}** tại hệ thống CloudPhone hiện có mức giá bán ưu đãi như sau ạ:\n\n` +
      `💰 **Giá bán chính hãng:** **${formatVnd(p.price)}**` +
      (savings > 0 ? ` *(Giá niêm yết ${formatVnd(p.original_price!)}, tiết kiệm ${formatVnd(savings)})*` : '') +
      `\n` +
      `⚙️ **Tóm tắt cấu hình máy:**\n` +
      `• **Màn hình:** ${p.screen}\n` +
      `• **Vi xử lý:** ${p.chip}\n` +
      `• **RAM/ROM:** ${p.ram_rom}\n` +
      `• **Camera:** ${p.camera}\n` +
      `• **Pin & Sạc:** ${p.battery}\n\n` +
      `🛡️ **Quyền lợi khi mua tại CloudPhone:**\n` +
      `• Máy mới 100% nguyên seal, bảo hành chính hãng và độc quyền 1 đổi 1 trong 30 ngày.\n` +
      `• Miễn phí giao hàng toàn quốc, hỏa tốc 1-2 giờ tại Hà Nội và TP.HCM.\n\n` +
      `Anh/chị có muốn đặt giữ máy ngay để nhận ưu đãi hoặc xem thêm thông số không ạ?`

    return {
      reply,
      suggestions: [`Đặt mua ${p.name}`, 'Phương thức thanh toán', 'Chính sách bảo hành 1 đổi 1'],
      products: [p],
    }
  }

  // Trường hợp 3: Tư vấn chi tiết chung về model này
  const reply =
    `Dạ em chào anh/chị! Em xin gửi thông tin tư vấn chi tiết về siêu phẩm **${p.name}** tại hệ thống CloudPhone ạ:\n\n` +
    `💰 **Giá bán chính hãng:** **${formatVnd(p.price)}**` +
    (savings > 0 ? ` *(Giá gốc ${formatVnd(p.original_price!)}, tiết kiệm ${formatVnd(savings)})*` : '') +
    `\n` +
    `⚙️ **Thông số kỹ thuật nổi bật:**\n` +
    `• **Màn hình:** ${p.screen}\n` +
    `• **Vi xử lý:** ${p.chip}\n` +
    `• **Bộ nhớ RAM/ROM:** ${p.ram_rom}\n` +
    `• **Hệ thống Camera:** ${p.camera}\n` +
    `• **Dung lượng Pin & Sạc:** ${p.battery}\n\n` +
    `✨ **Đặc điểm nổi bật:** ${p.description}\n\n` +
    `🛡️ **Chính sách & Quyền lợi độc quyền tại CloudPhone:**\n` +
    `• Máy mới 100% nguyên seal chính hãng, cam kết 1 đổi 1 trong 30 ngày nếu phát sinh lỗi nhà sản xuất\n` +
    `• Bảo hành chính hãng 12 - 24 tháng tại các trung tâm bảo hành ủy quyền toàn quốc\n` +
    `• Giao hàng hỏa tốc trong 1-2 giờ nội thành, miễn phí ship toàn quốc\n\n` +
    `Anh/chị có muốn đặt giữ máy trước hoặc cần em giải thích thêm thông số không ạ?`

  return {
    reply,
    suggestions: [`Đặt mua ${p.name}`, 'Phương thức thanh toán', 'Chính sách bảo hành 1 đổi 1'],
    products: [p],
  }
}

// 4. Tạo câu trả lời tư vấn chuẩn mực (Response Synthesizer)
export function generateAdvice(
  intent: ExtractedIntent,
  ranked: ScoredProduct[],
  allProducts: Product[]
): ChatResponse {
  const hasBudget = intent.maxBudget !== undefined
  if (!intent.isOutOfScope && !intent.isIdentity && !intent.unsupportedModel &&
      (hasBudget || (intent.wantsFoldable && !intent.specificModel))) {
    const maxBudget = intent.maxBudget ?? Infinity
    const eligible = allProducts.filter((p) =>
      p.stock > 0 && p.price >= (intent.minBudget ?? 0) &&
      (intent.budgetExclusive ? p.price < maxBudget : p.price <= maxBudget) &&
      (!intent.wantsFoldable || /\b(?:z\s*(?:fold|flip)(?=\d|\b)|iphone duo\b|pixel.*fold\b|razr\b|find n|mix fold|magic v)/i.test(p.name)
        || /màn hình gập|bản lề/i.test(p.description)) &&
      (!intent.brandPreference || intent.isComparison || p.brand.toLowerCase() === intent.brandPreference.toLowerCase()) &&
      (!intent.specificModel || intent.isComparison || p.name.toLowerCase().includes(intent.specificModel.toLowerCase()))
    )
    const picks = scoreAndRankProducts(eligible, intent).slice(0, 3)
    const limit = hasBudget ? (intent.budgetExclusive ? ' dưới ' : ' trong ngân sách tối đa ') + formatVnd(maxBudget) : ''
    const category = intent.wantsFoldable ? 'điện thoại màn hình gập' : 'điện thoại'
    if (!picks.length) {
      return {
        reply: `Dạ CloudPhone hiện chưa có ${category} còn hàng phù hợp với yêu cầu${limit}.`,
        products: [],
        suggestions: hasBudget ? ['Xem lựa chọn với ngân sách khác'] : ['Xem các mẫu điện thoại còn hàng'],
      }
    }
    const lines = picks.map(({ product }) => {
      const detail = intent.wantsPhoto ? product.camera
        : intent.wantsGaming || intent.wantsVideo ? product.chip
        : intent.wantsBattery ? product.battery : product.screen
      return `- **${product.name}** · ${formatVnd(product.price)} · ${detail}`
    })
    return {
      reply: `Dạ đây là các mẫu ${category} còn hàng phù hợp${limit}:\n${lines.join('\n')}`,
      products: picks.map(({ product }) => product),
      suggestions: picks.map(({ product }) => `Tư vấn chi tiết ${product.name}`),
    }
  }
  // Lọc ra các sản phẩm đạt điểm cao nhất (tối thiểu điểm dương)
  const validCandidates = ranked.filter((r) => r.score > 0)
  const topCandidates = validCandidates.slice(0, 3)

  // Đảm bảo có từ 2 - 4 sản phẩm
  let selectedCandidates = topCandidates
  if (selectedCandidates.length < 2 && ranked.length >= 2) {
    selectedCandidates = ranked.slice(0, 2)
  } else if (selectedCandidates.length > 4) {
    selectedCandidates = selectedCandidates.slice(0, 4)
  }

  const selectedProducts = selectedCandidates.map((c) => c.product)
  const suggestions: string[] = []

  let reply = ''

  // =========================================================================
  // CASE -1: Câu hỏi về danh tính AI (BIX)
  // =========================================================================
  if (intent.isIdentity) {
    return {
      reply:
        'Dạ em là **BIX** 🤖 - Trợ lý AI kiêm tư vấn viên công nghệ tại hệ thống bán lẻ smartphone CloudPhone ạ! Em tư vấn dựa trên danh mục sản phẩm CloudPhone. Em luôn sẵn sàng hỗ trợ anh/chị tìm điện thoại ưng ý theo nhu cầu, so sánh cấu hình và giải đáp phương thức thanh toán và chính sách bảo hành của shop ạ!',
      suggestions: [
        'Con máy chụp ảnh ngon nhất?',
        'Máy nào chơi game đỉnh nhất?',
        'Phương thức thanh toán',
        'Chính sách bảo hành 1 đổi 1',
      ],
      products: [],
    }
  }

  // =========================================================================
  // CASE 0: Câu hỏi ngoài phạm vi tư vấn điện thoại
  // =========================================================================
  if (intent.isOutOfScope) {
    return {
      reply: 'Dạ em là trợ lý BIX chuyên tư vấn điện thoại tại CloudPhone nên xin phép từ chối trả lời các chủ đề ngoài lề ạ. Em chỉ có thể hỗ trợ về thông số kỹ thuật, giá bán và chọn mua điện thoại tại CloudPhone thôi ạ.',
      suggestions: ['Con máy chụp ảnh ngon nhất?', 'Máy nào chơi game đỉnh nhất?', 'Phương thức thanh toán', 'Chính sách bảo hành 1 đổi 1'],
      products: [],
    }
  }

  // =========================================================================
  // CASE 0.5: Dòng máy hoặc thương hiệu không kinh doanh tại CloudPhone
  // =========================================================================
  if (intent.unsupportedModel) {
    let alt = ''
    const uLower = intent.unsupportedModel.toLowerCase()
    if (uLower.includes('poco')) {
      alt = '\n\nBên em hiện có sẵn phiên bản thế hệ mới cao cấp hơn cùng phân khúc Poco là **Poco F6 Pro 5G** (giá 12.49 triệu, chip Snapdragon 8 Gen 2, sạc 120W).'
    } else if (uLower.includes('nokia')) {
      alt = '\n\nCloudPhone hiện chỉ chuyên phân phối các dòng smartphone màn hình cảm ứng chính hãng thế hệ mới.'
    } else if (uLower.includes('iphone')) {
      alt = '\n\nHệ thống hiện có sẵn các dòng iPhone chính hãng từ **iPhone 13 (13.59 triệu)**, **iPhone 15 (19.49 triệu)** đến **iPhone 16 / 18 Pro Max**.'
    } else if (uLower.includes('s2') || uLower.includes('note')) {
      alt = '\n\nBên em hiện có sẵn dòng flagship Galaxy mới nhất là **Samsung Galaxy S24 Ultra 5G (27.99 triệu)** và **Galaxy S26 Ultra 5G**.'
    }

    return {
      reply: `Dạ hiện tại hệ thống CloudPhone **không có** (không kinh doanh) dòng máy **${intent.unsupportedModel}** ạ.${alt}\n\nAnh/chị có muốn tham khảo các mẫu smartphone chính hãng hiện có sẵn tại CloudPhone không ạ?`,
      suggestions: ['Con máy chơi game đỉnh nhất?', 'Xem điện thoại bán chạy', 'Phương thức thanh toán', 'Chính sách bảo hành 1 đổi 1'],
      products: [],
    }
  }

  // =========================================================================
  // CASE 0.6: Tra cứu tồn kho / có bán dòng máy cụ thể không
  // =========================================================================
  if (intent.isAvailabilityCheck && intent.availabilityTarget) {
    const targetLower = intent.availabilityTarget.toLowerCase().replace(/\s+/g, ' ').trim()
    // Tìm trong allProducts xem có máy nào khớp với từ khóa tìm kiếm không
    const matched = allProducts.find((p) => {
      const pName = p.name.toLowerCase()
      const pBrand = p.brand.toLowerCase()
      return (
        pName.includes(targetLower) ||
        targetLower.includes(pName) ||
        (targetLower.includes(pBrand) && pName.includes(targetLower.replace(pBrand, '').trim()))
      )
    })

    if (matched) {
      return {
        reply:
          `Dạ hệ thống CloudPhone hiện **CÓ SẴN** hàng chính hãng **${matched.name}** với giá **${formatVnd(matched.price)}** ạ!\n\n` +
          `• **Màn hình:** ${matched.screen}\n` +
          `• **Vi xử lý:** ${matched.chip}\n` +
          `• **Camera:** ${matched.camera}\n` +
          `• **Pin & Sạc:** ${matched.battery}\n\n` +
          `Bạn có thể xem cấu hình và giá trong trang chi tiết sản phẩm. Anh/chị có muốn đặt mua hoặc xem chi tiết máy không ạ?`,
        suggestions: [`Xem chi tiết ${matched.name}`, 'Phương thức thanh toán', 'Chính sách bảo hành 1 đổi 1'],
        products: [matched],
      }
    } else {
      // Khách hỏi máy không có trong danh mục sản phẩm của CloudPhone
      let alternativeHint = ''
      const targetClean = intent.availabilityTarget
      const tLower = targetClean.toLowerCase()

      if (tLower.includes('poco')) {
        alternativeHint = '\n\nBên em hiện có sẵn dòng máy thế hệ mới cao cấp hơn cùng phân khúc Poco là **Poco F6 Pro 5G** (giá 12.49 triệu, chip Snapdragon 8 Gen 2, sạc siêu tốc 120W, màn 2K 120Hz).'
      } else if (tLower.includes('iphone') || tLower.includes('ip')) {
        alternativeHint = '\n\nHiện tại CloudPhone đang phân phối sẵn các dòng iPhone chính hãng từ **iPhone 13 (13.59 triệu)**, **iPhone 15 (19.49 triệu)** cho đến **iPhone 16 Pro Max (34.99 triệu)** và thế hệ mới **iPhone 18 Series**.'
      } else if (tLower.includes('s23') || tLower.includes('s22') || tLower.includes('s21') || tLower.includes('note')) {
        alternativeHint = '\n\nBên em hiện có sẵn dòng Galaxy đầu bảng mới nhất là **Samsung Galaxy S24 Ultra 5G (27.99 triệu)** và siêu phẩm **Galaxy S26 Ultra 5G (32.99 triệu)**.'
      } else if (tLower.includes('a54') || tLower.includes('a53') || tLower.includes('a52') || tLower.includes('a34')) {
        alternativeHint = '\n\nBên em hiện có sẵn dòng nâng cấp mới nhất là **Samsung Galaxy A55 5G (9.19 triệu)** với khung kim loại và kháng nước IP67.'
      } else if (tLower.includes('redmi') || tLower.includes('xiaomi')) {
        alternativeHint = '\n\nBên em hiện có sẵn các dòng Xiaomi chính hãng cấu hình cao như **Poco F6 Pro 5G (12.49 triệu)**, **Xiaomi 17T Pro 5G (19.79 triệu)** và **Xiaomi 17 Ultra 5G**.'
      }

      return {
        reply:
          `Dạ hiện tại hệ thống CloudPhone **không có** (không kinh doanh) dòng máy **${targetClean}** ạ.${alternativeHint}\n\n` +
          `Anh/chị có muốn tham khảo các mẫu smartphone chính hãng hiện có sẵn tại CloudPhone không ạ?`,
        suggestions: ['Con máy chơi game đỉnh nhất?', 'Xem điện thoại bán chạy', 'Phương thức thanh toán', 'Chính sách bảo hành 1 đổi 1'],
        products: [],
      }
    }
  }

  // =========================================================================
  // CASE 0.7: Tư vấn chi tiết ĐÍCH DANH 1 dòng máy cụ thể
  // (Người dùng hỏi thẳng về 1 mẫu máy -> tư vấn chuyên sâu đúng chiếc máy đó,
  // tuyệt đối KHÔNG liệt kê tràn lan các mẫu máy khác)
  // =========================================================================
  if (intent.specificModel && !intent.isComparison) {
    const targetModelLower = intent.specificModel.toLowerCase()
    const matched = allProducts.find((p) => {
      const pNameLower = p.name.toLowerCase()
      return (
        pNameLower === targetModelLower ||
        pNameLower.includes(targetModelLower) ||
        targetModelLower.includes(pNameLower)
      )
    })

    if (matched) {
      return buildSingleModelAdvice(matched, intent)
    }
  }

  // =========================================================================
  // CASE 1: Chính sách trả góp / bảo hành
  // =========================================================================
  if (intent.isPolicy) {
    reply =
      `Dạ chào bạn! **CloudPhone** xin thông tin chi tiết đến bạn về các chính sách bán hàng hiện hành:\n\n` +
      `1. **Thanh toán**: Website hỗ trợ COD. Trả góp trực tuyến chưa khả dụng.\n` +
      `2. **Chế độ bảo hành**: Bảo hành 1 đổi 1 trong 30 ngày đầu tiên đối với lỗi phần cứng từ nhà sản xuất; bảo hành tiêu chuẩn từ 12 - 24 tháng.\n` +
      `3. **Vận chuyển**: Giao hàng hỏa tốc trong 2 giờ nội thành, miễn phí vận chuyển trên toàn quốc khi thanh toán chuyển khoản.\n` +
      `4. **Ưu đãi kèm theo**: Giảm thêm 500.000đ khi mua kèm phụ kiện sạc nhanh hoặc gói bảo hiểm rơi vỡ màn hình.\n\n` +
      `Bạn đang quan tâm dòng máy cụ thể nào để mình gửi thông số và giá bán ạ?`

    suggestions.push('Phương thức thanh toán', 'Chính sách bảo hành 1 đổi 1')
    return {
      reply,
      suggestions,
      products: [],
    }
  }

  // =========================================================================
  // CASE 2: So sánh iPhone với Xiaomi về quay phim
  // =========================================================================
  if (
    intent.isComparison &&
    intent.wantsVideo &&
    (intent.normalized.includes('iphone') || intent.normalized.includes('apple')) &&
    (intent.normalized.includes('xiaomi') || intent.normalized.includes('mi'))
  ) {
    const ip18pm = allProducts.find((p) => p.name.includes('18 Pro Max')) || allProducts[0]
    const mi17u = allProducts.find((p) => p.name.includes('17 Ultra')) || allProducts[6]
    const ip18p = allProducts.find((p) => p.name.includes('18 Pro 256GB')) || allProducts[1]

    reply =
      `Chào bạn! Khi so sánh khả năng **quay phim giữa iPhone và Xiaomi**, định hướng tư vấn tại CloudPhone phân định rõ theo nhu cầu sử dụng thực tế:\n\n` +
      `• **Về phía iPhone (${ip18pm.name} & ${ip18p.name}):** Chiếm ưu thế rõ rệt nếu bạn làm nội dung Vlog, TikTok, YouTube hoặc cần quay video đưa thẳng lên mạng xã hội. Hệ màu của iPhone chân thực, khả năng chống rung quang học ổn định cao, thuật toán xử lý ánh sáng mượt khi di chuyển góc quay và mic thu âm rất trong. Điểm hạn chế là giá thành cao và khả năng zoom xa khi quay chưa bằng ống kính tiềm vọng của Android.\n\n` +
      `• **Về phía Xiaomi (${mi17u.name}):** Lợi thế lớn ở cảm biến chính kích thước lớn 1 inch cùng hệ thống ống kính Leica và camera tele 200MP. Khi quay ngoại cảnh ban ngày hoặc cần zoom đa tiêu cự cinematic, Xiaomi cho độ chi tiết và hiệu ứng xóa phông quang học rất ấn tượng. Tuy nhiên, khi quay trực tiếp qua các ứng dụng mạng xã hội bên thứ ba, độ mượt mà và khả năng chống rung tổng thể vẫn chưa đồng đều như iPhone.\n\n` +
      `Tóm lại: Nếu ưu tiên quay video làm việc, làm nội dung sáng tạo ổn định, bạn nên cân nhắc iPhone; còn nếu thích sáng tạo góc quay tele zoom xa và hệ màu điện ảnh Leica, Xiaomi 17 Ultra là lựa chọn đáng trải nghiệm.`

    suggestions.push('iPhone 18 Pro Max giá bao nhiêu?', 'Xiaomi 17 Ultra có trả góp không?', 'Máy chuyên quay TikTok')
    return {
      reply,
      suggestions,
      products: [ip18pm, mi17u, ip18p],
    }
  }

  // =========================================================================
  // CASE 3: Chuyên quay TikTok / Video sáng tạo nội dung
  // =========================================================================
  if (intent.wantsVideo && !intent.wantsPhoto) {
    const ip18pm = allProducts.find((p) => p.name.includes('18 Pro Max'))
    const ip18p = allProducts.find((p) => p.name.includes('18 Pro 256GB'))
    const ip16pm = allProducts.find((p) => p.name.includes('16 Pro Max'))
    const ip15 = allProducts.find((p) => p.name.includes('iPhone 15 128GB'))

    const videoPicks = [ip18pm, ip18p, ip16pm, ip15].filter(Boolean) as Product[]
    const finalPicks = videoPicks.slice(0, 3)

    reply =
      `Chào bạn! Đối với nhu cầu **chuyên quay TikTok, Reels hay làm Vlog**, hệ sinh thái iPhone luôn là sự lựa chọn tối ưu hàng đầu tại CloudPhone nhờ khả năng tương thích camera sâu với các ứng dụng bên thứ ba:\n\n` +
      `1. **${ip18pm?.name} (${formatVnd(ip18pm?.price || 0)}):** Trang bị camera Pro Fusion 48MP có khẩu độ tùy chỉnh, chống rung cảm biến thế hệ mới và chip Apple A20 Pro giúp xuất video 4K nhanh chóng, mượt mà.\n` +
      `   *Điểm đánh đổi:* Mức giá cao nhất phân khúc và kích thước màn hình 6.9 inch khá lớn khi cầm quay liên tục.\n\n` +
      `2. **${ip18p?.name} (${formatVnd(ip18p?.price || 0)}):** Giữ nguyên cụm camera và sức mạnh chip A20 Pro nhưng trong thân máy 6.3 inch gọn nhẹ hơn, cầm quay chống mỏi tay.\n` +
      `   *Điểm đánh đổi:* Màn hình nhỏ hơn và thời lượng pin ở mức tối ưu vừa phải.\n\n` +
      `3. **${ip16pm ? ip16pm.name : ip15?.name} (${formatVnd(ip16pm ? ip16pm.price : ip15?.price || 0)}):** Lựa chọn cân bằng tài chính rất tốt, sở hữu nút điều khiển camera và thuật toán xử lý video đã được khẳng định độ ổn định cao.\n` +
      `   *Điểm đánh đổi:* Là thế hệ trước, công suất sạc USB-C ở mức tiêu chuẩn.\n\n` +
      `Bạn dự kiến mức ngân sách khoảng bao nhiêu triệu để mình tư vấn phương án phù hợp nhất ạ?`

    suggestions.push('iPhone 18 Pro giá bao nhiêu?', 'iPhone 16 Pro Max có hàng không?', 'Phương thức thanh toán')
    return {
      reply,
      suggestions,
      products: finalPicks,
    }
  }

  // =========================================================================
  // CASE 4: Vừa chụp ảnh vừa quay phim (Hybrid)
  // =========================================================================
  if (intent.wantsPhoto && intent.wantsVideo) {
    const mi17u = allProducts.find((p) => p.name.includes('17 Ultra')) || allProducts[6]
    const ip18pm = allProducts.find((p) => p.name.includes('18 Pro Max')) || allProducts[0]
    const s26u = allProducts.find((p) => p.name.includes('S26 Ultra')) || allProducts[3]

    reply =
      `Chào bạn! Với nhu cầu **kết hợp cả chụp ảnh đẹp lẫn quay phim chất lượng**, bạn đang đứng trước hai trường phái thiết bị rất rõ ràng:\n\n` +
      `1. **${mi17u.name} (${formatVnd(mi17u.price)}):** Thiên về nhiếp ảnh tĩnh với cảm biến 1 inch, hệ màu Leica đậm tính nghệ thuật và camera tele 200MP zoom xa cực nét. Máy cũng quay video tốt nhưng thế mạnh vượt trội vẫn là ảnh chụp.\n` +
      `   *Điểm đánh đổi:* Cụm mô-đun camera phía sau khá to và nặng.\n\n` +
      `2. **${ip18pm.name} (${formatVnd(ip18pm.price)}):** Là chuẩn mực về độ ổn định khi quay phim, dải sáng video mượt mà, đồng thời chụp ảnh Pro Fusion 48MP rất tự nhiên và sắc nét.\n` +
      `   *Điểm đánh đổi:* Khả năng zoom quang xa chưa bằng mức 200MP của các flagship Android.\n\n` +
      `3. **${s26u.name} (${formatVnd(s26u.price)}):** Ứng viên toàn năng cân bằng giữa camera 200MP, bút S Pen và các tính năng Galaxy AI chỉnh sửa ảnh/video nhanh.\n` +
      `   *Điểm đánh đổi:* Thân máy thiết kế vuông góc nam tính, cần dùng hai tay khi thao tác.\n\n` +
      `Bạn cho mình biết thêm tầm ngân sách dự kiến hoặc bạn thường chụp phong cảnh/chân dung nhiều hơn để mình chốt máy nhé!`

    suggestions.push('Xiaomi 17 Ultra chụp ảnh thế nào?', 'iPhone 18 Pro Max quay video', 'Galaxy S26 Ultra')
    return {
      reply,
      suggestions,
      products: [mi17u, ip18pm, s26u],
    }
  }

  // =========================================================================
  // CASE 5: Chụp ảnh đẹp dưới 20 triệu (hoặc chụp ảnh theo ngân sách cụ thể)
  // =========================================================================
  if (intent.wantsPhoto && intent.maxBudget && intent.maxBudget <= 21_000_000) {
    const x100 = allProducts.find((p) => p.name.includes('X100 Pro'))
    const reno12 = allProducts.find((p) => p.name.includes('Reno12 Pro'))
    const mi17t = allProducts.find((p) => p.name.includes('17T Pro'))
    const ip15 = allProducts.find((p) => p.name.includes('iPhone 15 128GB'))

    const photoPicks = [x100, reno12, mi17t, ip15].filter(Boolean) as Product[]

    reply =
      `Dạ em chào anh/chị! Tầm tiền dưới ${formatVnd(intent.maxBudget)} mà muốn chụp ảnh sống ảo "đẹp mê ly" thì em mách nước 3 ứng viên hoa hậu này nha: ✨\n\n` +
      `1. **${x100?.name} (${formatVnd(x100?.price || 18990000)}):** Trùm nhiếp ảnh phân khúc này luôn á! Có ống kính hợp tác cùng ZEISS và chip V3 chuyên xử lý ảnh, chụp chân dung da dẻ trắng hồng tự nhiên không cần qua 7749 filter, chụp đêm thì sáng rõ lung linh.\n` +
      `   *Điểm cân nhắc:* Thiết kế cụm camera tròn to bản đặc trưng dòng máy nhiếp ảnh chuyên nghiệp.\n\n` +
      `2. **${reno12?.name || mi17t?.name} (${formatVnd((reno12?.price || mi17t?.price) || 16000000)}):** Chuyên gia chân dung AI, làm đẹp tự nhiên xóa phông mượt mà, máy nhẹ tênh cầm rất thích tay mà giá cực kỳ hạt dẻ.\n` +
      `   *Điểm cân nhắc:* Cảm biến tầm trung, chụp thiếu sáng gắt không sâu bằng dòng flagship đắt tiền hơn.\n\n` +
      `3. **${ip15?.name} (${formatVnd(ip15?.price || 19490000)}):** Chụp chân thực, quay video TikTok/Reels thì nét căng không bao giờ bị bóp chất lượng khi up mạng xã hội.\n` +
      `   *Điểm cân nhắc:* Màn hình tần số quét 60Hz tiêu chuẩn.\n\n` +
      `Anh/chị thích gu màu ảnh chân dung nịnh mắt của vivo/OPPO hay màu chân thực của iPhone để em chọn màu máy hợp gu mình nhất nhé! 😊`

    suggestions.push('Vivo X100 Pro chụp đêm nét không?', 'OPPO Reno12 Pro giá bao nhiêu?', 'Phương thức thanh toán')
    return {
      reply,
      suggestions,
      products: photoPicks.slice(0, 3),
    }
  }

  // =========================================================================
  // CASE 6: Chụp ảnh ngon nhất (không giới hạn ngân sách)
  // =========================================================================
  if (intent.wantsPhoto && !intent.maxBudget) {
    const mi17u = allProducts.find((p) => p.name.includes('17 Ultra')) || allProducts[6]
    const x300 = allProducts.find((p) => p.name.includes('X300 Ultra')) || allProducts[9]
    const oppoX9 = allProducts.find((p) => p.name.includes('Find X9 Pro')) || allProducts[8]

    reply =
      `Dạ em chào anh/chị! Nếu để chọn chiếc máy chụp ảnh xuất sắc nhất tại CloudPhone hiện tại, em xin tư vấn thật lòng các siêu phẩm camera đỉnh nhất bên em:\n\n` +
      `1. **${mi17u.name} (${formatVnd(mi17u.price)}):** Sở hữu cảm biến chính 1 inch thu sáng vượt trội, hệ thống thấu kính quang học Leica và camera tele 200MP cho chất ảnh có chiều sâu và độ chi tiết cao.\n` +
      `   *Điểm đánh đổi:* Cụm camera lồi khá lớn và trọng lượng máy đầm tay.\n\n` +
      `2. **${x300.name} (${formatVnd(x300.price)}):** Ứng viên nhiếp ảnh cao cấp hợp tác cùng ZEISS với camera 200MP, lớp phủ chống lóa T* và màn hình QHD+ 144Hz hiển thị màu chuẩn xác.\n` +
      `   *Điểm đánh đổi:* Mức giá 35.99 triệu thuộc phân khúc cao cấp.\n\n` +
      `3. **${oppoX9.name} (${formatVnd(oppoX9.price)}):** Nổi bật với camera tele 200MP tối ưu riêng cho chụp chân dung Hasselblad, tái tạo tông màu da rất tự nhiên và pin lớn 7500mAh.\n` +
      `   *Điểm đánh đổi:* Thiết kế màn hình cong 6.78 inch cần dán cường lực chuyên dụng.\n\n` +
      `Anh/chị thường thích chụp ảnh chân dung hay phong cảnh hơn, và dự kiến tầm ngân sách khoảng bao nhiêu để em tư vấn màu sắc và ưu đãi tốt nhất cho mình nhé ạ!`

    suggestions.push('Xiaomi 17 Ultra giá bao nhiêu?', 'vivo X300 Ultra ZEISS', 'Máy chụp ảnh dưới 20 triệu')
    return {
      reply,
      suggestions,
      products: [mi17u, x300, oppoX9],
    }
  }

  // =========================================================================
  // CASE 7: Pin trâu + Chơi game nhiều
  // =========================================================================
  if (intent.wantsBattery && intent.wantsGaming) {
    const gt8 = allProducts.find((p) => p.name.includes('GT8 Pro'))
    const mi17t = allProducts.find((p) => p.name.includes('17T Pro'))
    const rog = allProducts.find((p) => p.name.includes('ROG Phone'))

    const gamingBattPicks = [gt8, mi17t, rog].filter(Boolean) as Product[]

    reply =
      `Dạ em chào anh/chị! Để vừa cày game mượt mà vừa có pin trâu dùng cả ngày không lo gián đoạn, đây là 3 cỗ máy chiến game hàng đầu bên em:\n\n` +
      `1. **${gt8?.name} (${formatVnd(gt8?.price || 18490000)}):** Lựa chọn số 1 với chip Snapdragon 8 Elite Gen 5, màn hình 2K 144Hz, pin Titan 7000mAh và sạc siêu tốc 120W.\n` +
      `   *Điểm đánh đổi:* Đây là bản xách tay, cần chú ý thông báo ứng dụng và chính sách cập nhật phần mềm.\n\n` +
      `2. **${mi17t?.name} (${formatVnd(mi17t?.price || 19790000)}):** Trang bị Dimensity 9500 thế hệ mới, màn hình AMOLED 144Hz và pin 7000mAh hỗ trợ sạc nhanh 100W, tản nhiệt mát mẻ.\n` +
      `   *Điểm đánh đổi:* Thiết kế máy màn hình lớn 6.83 inch tương đối to bản.\n\n` +
      `3. **${rog?.name} (${formatVnd(rog?.price || 28990000)}):** Cỗ máy chuyên gaming với phím siêu âm AirTrigger gán nút bắn, màn hình 165Hz và pin 5500mAh tối ưu bypass charging (vừa cắm sạc vừa chơi không hại pin).\n` +
      `   *Điểm đánh đổi:* Mức giá cao hơn đáng kể (28.99 triệu) và thiết kế mang phong cách game thủ cá tính.\n\n` +
      `*Lưu ý:* Chiếc realme 16T dù có pin 8000mAh nhưng chip Dimensity 6300 chỉ hợp game nhẹ, không tối ưu cho cày game nặng FPS cao.`

    suggestions.push('realme GT8 Pro xách tay', 'Xiaomi 17T Pro 144Hz', 'ASUS ROG Phone 8 Pro')
    return {
      reply,
      suggestions,
      products: gamingBattPicks,
    }
  }

  // =========================================================================
  // CASE 8: Pin trâu nói chung
  // =========================================================================
  if (intent.wantsBattery && !intent.wantsGaming) {
    const r16t = allProducts.find((p) => p.name.includes('16T'))
    const oppoX9 = allProducts.find((p) => p.name.includes('Find X9 Pro'))
    const mi17t = allProducts.find((p) => p.name.includes('17T Pro'))

    const battPicks = [r16t, oppoX9, mi17t].filter(Boolean) as Product[]

    reply =
      `Dạ em chào anh/chị! Muốn kiếm máy pin "trâu bò" dùng tẹt ga 2 - 3 ngày lướt TikTok mỏi cả tay không lo sập nguồn thì xem ngay 3 siêu phẩm này bên em nha: 🔋\n\n` +
      `1. **${r16t?.name} (${formatVnd(r16t?.price || 9590000)}):** "Vua lì đòn" với quả pin Titan 8000mAh khổng lồ, onscreen 2 - 3 ngày thoải mái, sạc nhanh 45W mà giá chưa tới 10 củ!\n` +
      `   *Điểm cân nhắc:* Màn hình LCD và chip Dimensity 6300 đủ dùng tác vụ hàng ngày.\n\n` +
      `2. **${mi17t?.name} (${formatVnd(mi17t?.price || 19790000)}):** Pin khủng 7000mAh kèm sạc siêu tốc 100W (cắm nửa tiếng là đầy nhóc), chip Dimensity 9500 siêu mạnh mẽ.\n` +
      `   *Điểm cân nhắc:* Màn hình 6.83 inch khá to bản đầm tay.\n\n` +
      `3. **${oppoX9?.name} (${formatVnd(oppoX9?.price || 32490000)}):** Flagship cao cấp pin 7500mAh, sạc nhanh 80W, camera Hasselblad chụp đẹp mê hồn.\n` +
      `   *Điểm cân nhắc:* Thuộc phân khúc flagship cao cấp.\n\n` +
      `Nếu anh/chị cần máy phụ pin bền giá mềm thì realme 16T là chân ái, còn làm máy chính cày việc thì Xiaomi 17T Pro bao ngon luôn ạ! Anh/chị ưng mẫu nào hơn nè?`

    suggestions.push('realme 16T pin dùng được mấy ngày?', 'Xiaomi 17T Pro sạc bao lâu đầy?', 'Phương thức thanh toán')
    return {
      reply,
      suggestions,
      products: battPicks,
    }
  }

  // =========================================================================
  // CASE 9: Máy chơi game tốt nhất trong tầm giá (Gaming)
  // =========================================================================
  if (intent.wantsGaming) {
    const gt8 = allProducts.find((p) => p.name.includes('GT8 Pro'))
    const poco = allProducts.find((p) => p.name.includes('Poco F6 Pro'))
    const mi17t = allProducts.find((p) => p.name.includes('17T Pro'))
    const rog = allProducts.find((p) => p.name.includes('ROG Phone'))

    const gamingPicks = [gt8, poco, mi17t, rog].filter(Boolean) as Product[]

    reply =
      `Chào bạn! Đánh giá về **hiệu năng chiến game trên giá thành (P/P)**, CloudPhone xin đề xuất những cỗ máy có sức mạnh chip và màn hình tần số quét cao vượt trội:\n\n` +
      `1. **${gt8?.name} (${formatVnd(gt8?.price || 18490000)}):** Vô địch cấu hình phân khúc dưới 20 triệu với Snapdragon 8 Elite Gen 5, màn hình 2K 144Hz, RAM 16GB và pin 7000mAh sạc 120W.\n` +
      `   *Điểm đánh đổi:* Phiên bản xách tay, phần mềm cần tối ưu lại quyền thông báo.\n\n` +
      `2. **${poco?.name} (${formatVnd(poco?.price || 12490000)}):** Lựa chọn số 1 tầm giá 12 triệu với chip Snapdragon 8 Gen 2, màn hình 2K 120Hz và sạc siêu nhanh 120W đầy pin trong 19 phút.\n` +
      `   *Điểm đánh đổi:* Camera chụp ở mức cơ bản, vỏ máy ấm lên khi cày game đồ họa nặng liên tục.\n\n` +
      `3. **${mi17t?.name} (${formatVnd(mi17t?.price || 19790000)}):** Sử dụng chip Dimensity 9500 tiến trình mới, màn hình 144Hz mượt mà và pin trâu 7000mAh.\n` +
      `   *Điểm đánh đổi:* Không có các phím phụ chuyên dụng như dòng máy gaming phone thuần túy.\n\n` +
      `4. **${rog?.name} (${formatVnd(rog?.price || 28990000)}):** Cỗ máy gaming chuyên biệt với màn hình 165Hz và phím cảm ứng AirTrigger nếu ngân sách bạn dư dả hơn.\n\n` +
      `Bạn thường chơi các tựa game nào (Liên Quân, Tốc Chiến hay Genshin Impact) để mình tư vấn cấu hình chuẩn nhất?`

    suggestions.push('realme GT8 Pro chơi game mượt không?', 'Poco F6 Pro giá bao nhiêu?', 'ASUS ROG Phone 8 Pro')
    return {
      reply,
      suggestions,
      products: gamingPicks.slice(0, 3),
    }
  }

  // =========================================================================
  // CASE 10: Điện thoại màn hình gập
  // =========================================================================
  if (intent.wantsFoldable) {
    const fold8 = allProducts.find((p) => p.name.includes('Z Fold8'))
    const duo = allProducts.find((p) => p.name.includes('iPhone Duo'))
    const flip6 = allProducts.find((p) => p.name.includes('Z Flip6'))

    const foldPicks = [fold8, duo, flip6].filter(Boolean) as Product[]

    reply =
      `Chào bạn! Dòng smartphone **màn hình gập cao cấp** tại CloudPhone hiện có các đại diện nổi bật ứng với hai kiểu dáng và hệ sinh thái khác nhau:\n\n` +
      `1. **${fold8?.name} (${formatVnd(fold8?.price || 46990000)}):** Mẫu gập dạng quyển sách cao cấp của Samsung với màn hình trong 7.6 inch, ngoài 5.5 inch, chip Snapdragon 8 Elite Gen 5 và hệ sinh thái Galaxy AI tối ưu đa nhiệm cửa sổ cực kỳ chín muồi.\n` +
      `   *Điểm đánh đổi:* Mức giá 46.99 triệu và nếp gấp màn hình vẫn có thể cảm nhận nhẹ khi vuốt ngang.\n\n` +
      `2. **${duo?.name} (${formatVnd(duo?.price || 64999000)}):** Thiết bị màn hình gập đột phá đầu tiên từ Apple với khung titan siêu nhẹ, chip Apple A20 Pro và trải nghiệm iOS màn hình lớn độc bản.\n` +
      `   *Điểm đánh đổi:* Mức giá rất cao (64.999 triệu), là thế hệ sản phẩm gập đầu tiên nên số lượng phụ kiện chưa phong phú.\n\n` +
      `3. **${flip6?.name} (${formatVnd(flip6?.price || 21990000)}):** Nếu bạn thích kiểu dáng gập vỏ sò nhỏ gọn thời trang, bỏ túi tiện lợi và chi phí dễ tiếp cận hơn nhiều.\n` +
      `   *Điểm đánh đổi:* Dung lượng pin 4000mAh chỉ vừa đủ cho nhu cầu trong ngày.\n\n` +
      `Bạn ưu tiên máy gập màn hình lớn để làm việc đa nhiệm hay gập nhỏ gọn thời trang bỏ túi ạ?`

    suggestions.push('Samsung Galaxy Z Fold8', 'iPhone Duo màn hình gập', 'Samsung Galaxy Z Flip6')
    return {
      reply,
      suggestions,
      products: foldPicks,
    }
  }

  // =========================================================================
  // CASE 11: Ngân sách 10 triệu (hoặc dưới 10 triệu)
  // =========================================================================
  if (intent.maxBudget && intent.maxBudget <= 11_500_000) {
    const a55 = allProducts.find((p) => p.name.includes('A55'))
    const r16t = allProducts.find((p) => p.name.includes('16T'))
    const poco = allProducts.find((p) => p.name.includes('Poco F6 Pro'))

    const budgetPicks = [a55, r16t].filter(Boolean) as Product[]

    reply =
      `Dạ chào bạn! Với **tầm tài chính khoảng 10 triệu**, CloudPhone đề xuất 2 mẫu máy đáp ứng trọn vẹn ngân sách hiện có:\n\n` +
      `1. **${a55?.name} (${formatVnd(a55?.price || 9190000)}):** Lựa chọn an tâm, toàn diện với màn hình Super AMOLED 120Hz rực rỡ, khung kim loại cao cấp, kháng nước IP67 và bảo mật Knox Vault chính hãng.\n` +
      `   *Điểm đánh đổi:* Tốc độ sạc tối đa 25W và hiệu năng chip Exynos 1480 chỉ ở mức ổn định tác vụ hằng ngày.\n\n` +
      `2. **${r16t?.name} (${formatVnd(r16t?.price || 9590000)}):** Dành riêng cho người cần thời lượng sử dụng cực dài nhờ viên pin Titan 8000mAh, màn hình tần số quét 144Hz và sạc nhanh 45W.\n` +
      `   *Điểm đánh đổi:* Tấm nền LCD hiển thị màu không sâu bằng AMOLED và chip Dimensity 6300 chỉ chơi được game vừa phải.\n\n` +
      `*(Lưu ý thêm)*: Nếu bạn có thể nâng ngân sách lên khoảng 12.5 triệu, chiếc **${poco?.name}** sẽ là bước nhảy vọt về hiệu năng với chip Snapdragon 8 Gen 2 và sạc 120W siêu tốc.\n\n` +
      `Bạn ưu tiên pin trâu dùng nhiều ngày hay thương hiệu Samsung bền bỉ chống nước tốt hơn?`

    suggestions.push('Samsung Galaxy A55 5G', 'realme 16T pin 8000mAh', 'Xem thêm máy 15 triệu')
    return {
      reply,
      suggestions,
      products: budgetPicks,
    }
  }

  // =========================================================================
  // CASE 12: Học tập, làm việc và thỉnh thoảng chụp ảnh
  // =========================================================================
  if (intent.wantsWorkStudy) {
    const s26 = allProducts.find((p) => p.name.includes('Galaxy S26 5G 256GB'))
    const ip15 = allProducts.find((p) => p.name.includes('iPhone 15 128GB'))
    const a55 = allProducts.find((p) => p.name.includes('A55'))
    const pixel = allProducts.find((p) => p.name.includes('Pixel 9 Pro XL'))

    const studyPicks = [s26, ip15, a55, pixel].filter(Boolean) as Product[]

    reply =
      `Chào bạn! Đối với nhu cầu **học tập, làm việc văn phòng và thỉnh thoảng chụp ảnh**, tiêu chí hàng đầu là sự ổn định, thiết kế gọn gàng, tính năng hỗ trợ công việc và camera tự nhiên:\n\n` +
      `1. **${s26?.name} (${formatVnd(s26?.price || 21990000)}):** Kích thước 6.3 inch nhỏ gọn cầm nắm thoải mái, tích hợp bộ công cụ Galaxy AI giúp tóm tắt bài giảng, dịch tài liệu tức thì và camera 120Hz đa dụng.\n` +
      `   *Điểm đánh đổi:* Dung lượng pin 4300mAh ở mức tiêu chuẩn cho một ngày làm việc.\n\n` +
      `2. **${ip15?.name} (${formatVnd(ip15?.price || 19490000)}):** Vận hành ổn định tuyệt đối với các ứng dụng ghi chú, Office, FaceTime và camera 48MP cho ảnh chụp tài liệu, đời sống rất sắc nét.\n` +
      `   *Điểm đánh đổi:* Màn hình tần số quét 60Hz truyền thống.\n\n` +
      `3. **${a55?.name} (${formatVnd(a55?.price || 9190000)}):** Phương án tiết kiệm kinh tế dưới 10 triệu, màn hình lớn 6.6 inch hiển thị đẹp, pin 5000mAh học online bền bỉ cả ngày.\n` +
      `   *Điểm đánh đổi:* Hiệu năng vừa đủ dùng hằng ngày, không chuyên sâu đồ họa nặng.\n\n` +
      `Bạn mong muốn một chiếc máy nhỏ gọn hay thích màn hình rộng để đọc tài liệu dễ hơn ạ?`

    suggestions.push('Samsung Galaxy S26 5G', 'iPhone 15 128GB', 'Samsung Galaxy A55 5G')
    return {
      reply,
      suggestions,
      products: studyPicks.slice(0, 3),
    }
  }

  // =========================================================================
  // CASE 13: Điện thoại tốt nhất hiện tại (General Best)
  // =========================================================================
  if (intent.isGeneralBest) {
    const mi17u = allProducts.find((p) => p.name.includes('17 Ultra')) || allProducts[6]
    const ip18pm = allProducts.find((p) => p.name.includes('18 Pro Max')) || allProducts[0]
    const s26u = allProducts.find((p) => p.name.includes('S26 Ultra')) || allProducts[3]
    const fold8 = allProducts.find((p) => p.name.includes('Z Fold8')) || allProducts[5]

    reply =
      `Dạ em chào anh/chị! Nếu xét về những siêu phẩm đầu bảng tại CloudPhone hiện tại, mỗi dòng máy lại dẫn đầu ở một thế mạnh riêng biệt để anh/chị lựa chọn theo đúng gu của mình:\n\n` +
      `1. **${mi17u.name} (${formatVnd(mi17u.price)}):** Đỉnh cao về **nhiếp ảnh tĩnh** với cảm biến kích thước lớn 1 inch, thấu kính Leica và camera tele 200MP.\n` +
      `   *Điểm đánh đổi:* Cụm camera to và máy đầm tay.\n\n` +
      `2. **${ip18pm.name} (${formatVnd(ip18pm.price)}):** Dẫn đầu về **quay video, hiệu năng A20 Pro và sự ổn định dài lâu** trong hệ sinh thái Apple.\n` +
      `   *Điểm đánh đổi:* Mức giá cao và khả năng zoom xa ở mức 5x.\n\n` +
      `3. **${s26u.name} (${formatVnd(s26u.price)}):** Chiếc máy **toàn diện nhất** cho công việc với bút S Pen, màn hình QHD+ Dynamic AMOLED 2X và bộ công cụ Galaxy AI mạnh mẽ.\n` +
      `   *Điểm đánh đổi:* Thiết kế góc cạnh kích thước lớn.\n\n` +
      `4. **${fold8.name} (${formatVnd(fold8.price)}):** Đỉnh cao về **đa nhiệm màn hình gập** 7.6 inch phục vụ công việc và giải trí không gian lớn.\n\n` +
      `Anh/chị đang ưu tiên tiêu chí nào nhất: chụp ảnh nghệ thuật, quay video làm nội dung, chiến game hay màn hình gập để em tư vấn màu sắc và ưu đãi tốt nhất cho mình nhé ạ!`

    suggestions.push('Xiaomi 17 Ultra Leica', 'iPhone 18 Pro Max', 'Samsung Galaxy S26 Ultra', 'Samsung Galaxy Z Fold8')
    return {
      reply,
      suggestions,
      products: [mi17u, ip18pm, s26u, fold8],
    }
  }

  // =========================================================================
  // DEFAULT CASE: Phân tích theo điểm số ranking động
  // =========================================================================
  let summaryCriteria = 'nhu cầu của anh/chị'
  if (intent.brandPreference) summaryCriteria = `thương hiệu ${intent.brandPreference}`
  if (intent.maxBudget) summaryCriteria = `mức ngân sách khoảng ${formatVnd(intent.maxBudget)}`

  let dynamicItemsText = ''
  selectedCandidates.forEach((cand, idx) => {
    const p = cand.product
    const whyFit = cand.reasons.length > 0 ? cand.reasons.join(', ') : `Trang bị ${p.chip}, màn hình ${p.screen}, pin ${p.battery}`
    const limitation = cand.tradeOffs.length > 0 ? cand.tradeOffs[0] : 'Giá thành tương xứng với phân khúc trang bị'

    dynamicItemsText += `${idx + 1}. **${p.name} (${formatVnd(p.price)}):** ${whyFit}.\n   *Điểm cân nhắc:* ${limitation}.\n\n`
  })

  reply =
    `Dạ em chào anh/chị! Để đáp ứng tốt nhất ${summaryCriteria}, em xin tư vấn thật lòng các mẫu máy nổi bật và đáng mua nhất bên em:\n\n` +
    dynamicItemsText +
    `Anh/chị đang ưng ý mẫu máy nào hơn, hoặc cần em so sánh thêm thông số không ạ?`

  selectedCandidates.forEach((c) => {
    suggestions.push(`${c.product.name} giá bao nhiêu?`)
  })
  if (suggestions.length < 3) {
    suggestions.push('Phương thức thanh toán', 'Tư vấn máy chụp ảnh đẹp')
  }

  return {
    reply,
    suggestions: suggestions.slice(0, 4),
    products: selectedProducts,
  }
}
