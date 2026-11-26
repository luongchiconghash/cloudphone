import fs from 'node:fs'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { extractIntent, scoreAndRankProducts, generateAdvice } from './src/advisor.ts'
import type { Product } from './src/index.ts'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Hàm đọc và bóc tách 24 sản phẩm thực tế từ migrations/0003_seed_catalog.sql
function loadProductsFromSeed(): Product[] {
  const seedPath = path.join(__dirname, 'migrations/0003_seed_catalog.sql')
  const content = fs.readFileSync(seedPath, 'utf-8')

  const products: Product[] = []
  // Regex bóc tách các khối VALUES (...)
  const blockRegex = /\(\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*(NULL|\d+),\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*'([^']+)',\s*(\d+),\s*([\d.]+),\s*'([^']*)',\s*'([^']*)'\s*\)/g

  let match: RegExpExecArray | null
  let id = 1
  while ((match = blockRegex.exec(content)) !== null) {
    products.push({
      id: id++,
      name: match[1],
      brand: match[2],
      price: parseInt(match[3], 10),
      original_price: match[4] === 'NULL' ? null : parseInt(match[4], 10),
      image: match[5],
      chip: match[6],
      screen: match[7],
      ram_rom: match[8],
      battery: match[9],
      camera: match[10],
      stock: parseInt(match[11], 10),
      rating: parseFloat(match[12]),
      tag: match[13],
      description: match[14],
    })
  }

  return products
}

const testQuestions = [
  'Con máy chụp ảnh ngon nhất?',
  'iPhone với Xiaomi máy nào quay phim tốt hơn?',
  'Tao cần máy chuyên quay TikTok.',
  'Tao cần máy chụp ảnh đẹp dưới 20 triệu.',
  'Máy chơi game tốt nhất trong tầm giá?',
  'Tao cần pin trâu, chơi game nhiều.',
  'Máy gập nào đáng mua?',
  'Tao có 10 triệu, nên mua máy nào?',
  'Tao muốn điện thoại dùng học tập, làm việc và thỉnh thoảng chụp ảnh.',
  'Điện thoại tốt nhất hiện tại là máy nào?',
  'Tư vấn cho tôi về chiếc realme GT8 Pro 5G 16GB/512GB này có ưu nhược điểm gì và có nên mua không?',
  'iPhone Duo 256GB giá bao nhiêu?',
  'có nokia1280 không',
  'bên mình có bán bphone không',
  'thời tiết hôm nay thế nào',
  'toi muốn mua poco f5',
]

function runAllTests() {
  const products = loadProductsFromSeed()
  console.log(`\n======================================================`)
  console.log(`🚀 BẮT ĐẦU KIỂM THỬ HỆ THỐNG TƯ VẤN BIX (CloudPhone AI)`)
  console.log(`📊 Số lượng sản phẩm thực tế trong Database: ${products.length}`)
  console.log(`======================================================\n`)

  if (products.length !== 24) {
    console.error(`❌ Cảnh báo: Dataset phải có đúng 24 sản phẩm! Hiện có: ${products.length}`)
    process.exit(1)
  }

  const results: any[] = []

  testQuestions.forEach((q, idx) => {
    console.log(`------------------------------------------------------`)
    console.log(`Test Case #${idx + 1}: "${q}"`)
    console.log(`------------------------------------------------------`)

    // 1. Phân tích ý định
    const intent = extractIntent(q)
    console.log(`[1] Phân tích ý định (Intent):`, {
      wantsPhoto: intent.wantsPhoto,
      wantsVideo: intent.wantsVideo,
      wantsGaming: intent.wantsGaming,
      wantsBattery: intent.wantsBattery,
      wantsFoldable: intent.wantsFoldable,
      wantsWorkStudy: intent.wantsWorkStudy,
      isComparison: intent.isComparison,
      isGeneralBest: intent.isGeneralBest,
      maxBudget: intent.maxBudget,
      targetBudget: intent.targetBudget,
    })

    // 2. Chấm điểm & Xếp hạng
    const ranked = scoreAndRankProducts(products, intent)

    // 3. Tạo phản hồi
    const response = generateAdvice(intent, ranked, products)

    console.log(`[2] Top sản phẩm đề xuất (products array: ${response.products.length} máy):`)
    response.products.forEach((p, pIdx) => {
      console.log(`    ${pIdx + 1}. [ID ${p.id}] ${p.name} - ${p.brand} - ${(p.price / 1e6).toFixed(2)}tr - Chip: ${p.chip} - Pin: ${p.battery}`)
    })

    console.log(`[3] Nội dung trả lời (reply snippet):`)
    const replyLines = response.reply.split('\n')
    console.log(`    "${replyLines[0]}"`)
    if (replyLines.length > 2) {
      console.log(`    "${replyLines[2]}"`)
    }

    console.log(`[4] Suggestions:`, response.suggestions)

    // --- CÁC ĐIỀU KIỆN KIỂM ĐỊNH (ASSERTIONS) ---
    // A. Kiểm tra số lượng sản phẩm phù hợp theo loại câu hỏi
    if (intent.specificModel) {
      if (response.products.length !== 1) {
        throw new Error(`Test #${idx + 1} Thất bại: Hỏi đích danh 1 máy thì chỉ được trả về đúng 1 sản phẩm! Hiện có: ${response.products.length}`)
      }
    } else if (intent.unsupportedModel || intent.isOutOfScope) {
      if (response.products.length !== 0) {
        throw new Error(`Test #${idx + 1} Thất bại: Hỏi máy không kinh doanh hoặc ngoài lề thì products phải rỗng (0 máy)! Hiện có: ${response.products.length}`)
      }
    } else {
      if (response.products.length < 2 || response.products.length > 4) {
        throw new Error(`Test #${idx + 1} Thất bại: Số lượng sản phẩm tư vấn chung (${response.products.length}) phải từ 2 đến 4!`)
      }
    }

    // B. Sản phẩm đề xuất phải tồn tại 100% trong database
    for (const p of response.products) {
      const exists = products.find((dbP) => dbP.id === p.id && dbP.name === p.name && dbP.price === p.price)
      if (!exists) {
        throw new Error(`Test #${idx + 1} Thất bại: Sản phẩm "${p.name}" không tồn tại hoặc sai giá trong database!`)
      }
    }

    // C. Kiểm tra ràng buộc ngân sách cụ thể
    if (intent.maxBudget) {
      for (const p of response.products) {
        if (p.price > intent.maxBudget * 1.05) {
          throw new Error(`Test #${idx + 1} Thất bại: Sản phẩm "${p.name}" có giá ${p.price} vượt quá ngân sách ${intent.maxBudget}!`)
        }
      }
    }

    // D. Kiểm tra logic từng câu hỏi đặc thù
    if (idx === 0) {
      // "Con máy chụp ảnh ngon nhất?" -> Phải có Xiaomi 17 Ultra hoặc vivo X300 Ultra
      const hasMi17U = response.products.some((p) => p.name.includes('17 Ultra'))
      const hasX300 = response.products.some((p) => p.name.includes('X300 Ultra'))
      if (!hasMi17U && !hasX300) {
        throw new Error(`Test #1 Thất bại: Cần có Xiaomi 17 Ultra hoặc vivo X300 Ultra trong top chụp ảnh!`)
      }
    } else if (idx === 1) {
      // "iPhone với Xiaomi máy nào quay phim tốt hơn?" -> Phải có iPhone 18 Pro Max và Xiaomi 17 Ultra
      const hasIPhone = response.products.some((p) => p.brand === 'Apple')
      const hasXiaomi = response.products.some((p) => p.brand === 'Xiaomi')
      if (!hasIPhone || !hasXiaomi) {
        throw new Error(`Test #2 Thất bại: So sánh quay phim cần có cả iPhone và Xiaomi!`)
      }
    } else if (idx === 2) {
      // "Tao cần máy chuyên quay TikTok" -> Ưu tiên iPhone
      const appleCount = response.products.filter((p) => p.brand === 'Apple').length
      if (appleCount < 2) {
        throw new Error(`Test #3 Thất bại: Quay TikTok cần ưu tiên hệ sinh thái iPhone!`)
      }
    } else if (idx === 3) {
      // "Tao cần máy chụp ảnh đẹp dưới 20 triệu" -> Giá <= 20M, có Vivo X100 Pro hoặc Xiaomi 17T Pro / iPhone 15
      const hasX100 = response.products.some((p) => p.name.includes('X100 Pro'))
      if (!hasX100) {
        throw new Error(`Test #4 Thất bại: Chụp ảnh đẹp dưới 20tr phải có Vivo X100 Pro ZEISS!`)
      }
    } else if (idx === 4) {
      // "Máy chơi game tốt nhất trong tầm giá?" -> realme GT8 Pro hoặc Poco F6 Pro
      const hasGT8 = response.products.some((p) => p.name.includes('GT8 Pro'))
      const hasPoco = response.products.some((p) => p.name.includes('Poco F6 Pro'))
      if (!hasGT8 && !hasPoco) {
        throw new Error(`Test #5 Thất bại: Chơi game tốt trong tầm giá cần có GT8 Pro hoặc Poco F6 Pro!`)
      }
    } else if (idx === 5) {
      // "Tao cần pin trâu, chơi game nhiều." -> realme GT8 Pro hoặc Xiaomi 17T Pro (pin 7000mAh)
      const has7000 = response.products.some((p) => p.battery.includes('7000') || p.name.includes('GT8 Pro') || p.name.includes('17T Pro'))
      if (!has7000) {
        throw new Error(`Test #6 Thất bại: Pin trâu chơi game nhiều cần máy pin lớn và chip mạnh!`)
      }
    } else if (idx === 6) {
      // "Máy gập nào đáng mua?" -> Phải có Z Fold8 và iPhone Duo
      const hasFold = response.products.some((p) => p.name.includes('Z Fold8') || p.name.includes('Duo'))
      if (!hasFold) {
        throw new Error(`Test #7 Thất bại: Cần có máy màn hình gập!`)
      }
    } else if (idx === 7) {
      // "Tao có 10 triệu, nên mua máy nào?" -> Phải có Galaxy A55 hoặc realme 16T
      const hasA55 = response.products.some((p) => p.name.includes('A55'))
      const has16T = response.products.some((p) => p.name.includes('16T'))
      if (!hasA55 && !has16T) {
        throw new Error(`Test #8 Thất bại: Tầm giá 10 triệu cần có Galaxy A55 hoặc realme 16T!`)
      }
    } else if (idx === 8) {
      // "Tao muốn điện thoại dùng học tập, làm việc và thỉnh thoảng chụp ảnh."
      const hasWorkPick = response.products.some((p) => p.name.includes('Galaxy S26') || p.name.includes('iPhone 15') || p.name.includes('A55'))
      if (!hasWorkPick) {
        throw new Error(`Test #9 Thất bại: Học tập, làm việc cần đề xuất máy cân bằng ổn định!`)
      }
    } else if (idx === 9) {
      // "Điện thoại tốt nhất hiện tại là máy nào?" -> Phải có flagship đại diện các phân khúc
      if (response.products.length < 3) {
        throw new Error(`Test #10 Thất bại: Cần đề xuất nhóm flagship tiêu biểu đại diện!`)
      }
    } else if (idx === 10) {
      // "Tư vấn cho tôi về chiếc realme GT8 Pro 5G 16GB/512GB này có ưu nhược điểm gì và có nên mua không?"
      if (!response.products[0].name.includes('realme GT8 Pro')) {
        throw new Error(`Test #11 Thất bại: Phải trả về đích danh realme GT8 Pro!`)
      }
      if (!response.reply.includes('ƯU ĐIỂM') || !response.reply.includes('NHƯỢC ĐIỂM')) {
        throw new Error(`Test #11 Thất bại: Phải phân tích rõ Ưu điểm và Nhược điểm!`)
      }
    } else if (idx === 11) {
      // "iPhone Duo 256GB giá bao nhiêu?"
      if (!response.products[0].name.includes('iPhone Duo')) {
        throw new Error(`Test #12 Thất bại: Phải trả về đích danh iPhone Duo!`)
      }
      if (!response.reply.includes('65.0 triệu')) {
        throw new Error(`Test #12 Thất bại: Phải trả lời đúng giá 65.0 triệu của iPhone Duo!`)
      }
    } else if (idx === 12) {
      // "có nokia1280 không"
      if (!response.reply.includes('không kinh doanh') || !response.reply.includes('Nokia')) {
        throw new Error(`Test #13 Thất bại: Phải trả lời rõ ràng không kinh doanh dòng máy Nokia!`)
      }
    } else if (idx === 13) {
      // "bên mình có bán bphone không"
      if (!response.reply.includes('không kinh doanh') || !response.reply.includes('Bphone')) {
        throw new Error(`Test #14 Thất bại: Phải trả lời rõ ràng không kinh doanh dòng máy Bphone!`)
      }
    } else if (idx === 14) {
      // "thời tiết hôm nay thế nào"
      if (!response.reply.includes('từ chối trả lời các chủ đề ngoài lề')) {
        throw new Error(`Test #15 Thất bại: Phải từ chối trả lời câu hỏi ngoài lề không liên quan điện thoại!`)
      }
    } else if (idx === 15) {
      // "toi muốn mua poco f5" -> Không có thì phải nói là không có!
      if (response.products.length !== 0) {
        throw new Error(`Test #16 Thất bại: Poco F5 không có trong kho nên products phải rỗng (0 máy), không được gợi ý Xiaomi 17 Ultra!`)
      }
      if (!response.reply.toLowerCase().includes('không có') && !response.reply.toLowerCase().includes('không kinh doanh')) {
        throw new Error(`Test #16 Thất bại: Phải trả lời rõ là không có / không kinh doanh Poco F5!`)
      }
      if (!response.reply.includes('Poco F5') && !response.reply.includes('Poco')) {
        throw new Error(`Test #16 Thất bại: Phải nêu rõ tên dòng máy Poco F5!`)
      }
    }

    console.log(`✅ Test Case #${idx + 1} PASSED!\n`)
    results.push({
      question: q,
      passed: true,
      topProducts: response.products.map((p) => p.name),
    })
  })

  console.log(`======================================================`)
  console.log(`🎉 TẤT CẢ ${testQuestions.length}/${testQuestions.length} TEST CASES ĐÃ ĐẠT CHUẨN 100%!`)
  console.log(`======================================================`)
}

runAllTests()

const catalog = loadProductsFromSeed()
for (const question of ['Máy chụp ảnh dưới 10 triệu', 'Điện thoại chơi game dưới 10 triệu']) {
  const intent = extractIntent(question)
  const result = generateAdvice(intent, scoreAndRankProducts(catalog, intent), catalog)
  assert.ok(result.products.length > 0)
  assert.ok(result.products.every((p) => p.price < 10_000_000), question)
}
const foldIntent = extractIntent('Điện thoại màn hình gập dưới 15 triệu')
const foldResult = generateAdvice(foldIntent, scoreAndRankProducts(catalog, foldIntent), catalog)
assert.deepEqual(foldResult.products, [])
assert.match(foldResult.reply, /chưa có.*màn hình gập/)
console.log('✅ Kiểm thử bổ sung: không vượt ngân sách và không thay máy gập bằng máy thường.')
