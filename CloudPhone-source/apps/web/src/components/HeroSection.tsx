import { useState, useEffect, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Zap,
  Cpu,
  Camera,
  Battery,
  Flame,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { type Product } from '../api'

type Props = {
  products: Product[]
  onSelectProduct: (product: Product) => void
  onAskAI: (prompt: string) => void
}

interface HeroSlideData {
  id: string
  productQuery: string
  label: string
  techBadge: string
  title: string
  tagline: string
  desc: string
  specChips: { icon: 'cpu' | 'camera' | 'hz' | 'battery'; label: string }[]
  image: string
  glowColor: string
}

const HERO_DATA: HeroSlideData[] = [
  {
    id: 'iphone-duo',
    productQuery: 'iPhone Duo',
    label: 'APPLE FLAGSHIP • CHÍNH THỨC LÊN KỆ',
    techBadge: 'CHIP A20 PRO 2NM • BẢN LỀ TITAN',
    title: 'iPhone Duo',
    tagline: 'Siêu phẩm gập đầu tiên từ Apple đã có mặt tại CloudPhone.',
    desc: 'Thiết kế bản lề titan không nếp gấp, màn hình trong 7.6" ProMotion 120Hz, chip Apple A20 Pro 2nm và hệ thống camera tiềm vọng thế hệ mới.',
    specChips: [
      { icon: 'cpu', label: 'Chip Apple A20 Pro 2nm' },
      { icon: 'camera', label: 'Camera Pro Fusion 48MP' },
      { icon: 'hz', label: 'Màn gập 7.6" OLED 120Hz' },
      { icon: 'battery', label: 'Pin kép 4800mAh Sạc 45W' },
    ],
    image: '/phones/hero-iphone-duo-clean.png',
    glowColor: 'rgba(59, 130, 246, 0.20)',
  },
  {
    id: 'xiaomi-17-ultra',
    productQuery: 'Xiaomi 17 Ultra',
    label: 'LEICA MASTERY • CHÍNH THỨC MỞ BÁN',
    techBadge: 'LEICA SUMMILUX 200MP • CẢM BIẾN 1 INCH',
    title: 'Xiaomi 17 Ultra 5G',
    tagline: 'Cảm biến 1 inch • Đỉnh cao nhiếp ảnh di động.',
    desc: 'Hợp tác cùng Leica mang tới hệ thống 4 ống kính quang học 200MP, chip Snapdragon 8 Elite Gen 5 cực đại và công nghệ tản nhiệt buồng hơi 3D.',
    specChips: [
      { icon: 'cpu', label: 'Snapdragon 8 Elite' },
      { icon: 'camera', label: 'Cảm biến 1-inch Leica 200MP' },
      { icon: 'hz', label: 'HyperRGB OLED 120Hz' },
      { icon: 'battery', label: 'Pin 6000mAh Sạc 120W' },
    ],
    image: '/phones/hero-xiaomi-17-ultra-clean.png',
    glowColor: 'rgba(249, 115, 22, 0.18)',
  },
  {
    id: 'iphone-18-pro-max',
    productQuery: 'iPhone 18 Pro Max',
    label: 'TITANIUM BURGUNDY • FLAGSHIP 2026',
    techBadge: 'KHUNG TITAN BURGUNDY • PIN 33 GIỜ',
    title: 'iPhone 18 Pro Max',
    tagline: 'Hiệu năng A20 Pro bứt phá mọi giới hạn.',
    desc: 'Khung viền Titan Burgundy chế tác thủ công, viền màn hình siêu mỏng 1.1mm, camera tùy chỉnh khẩu độ cơ học và thời lượng pin dẫn đầu phân khúc.',
    specChips: [
      { icon: 'cpu', label: 'Apple A20 Pro Siêu Tốc' },
      { icon: 'camera', label: 'Pro Fusion Khẩu độ tùy chỉnh' },
      { icon: 'hz', label: 'Super Retina XDR 6.9" 120Hz' },
      { icon: 'battery', label: 'Thời lượng pin 33h liên tục' },
    ],
    image: '/phones/hero-iphone-18-pro-max-clean.png',
    glowColor: 'rgba(190, 18, 60, 0.20)',
  },
]

export default function HeroSection({ products, onSelectProduct, onAskAI }: Props) {
  const [currentIdx, setCurrentIdx] = useState(0)
  const [slideDirection, setSlideDirection] = useState<'next' | 'prev'>('next')
  const [isPaused, setIsPaused] = useState(false)

  // Countdown timer for 24h flash sale
  const [timeLeft, setTimeLeft] = useState({ hours: 14, minutes: 28, seconds: 45 })

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev.seconds > 0) return { ...prev, seconds: prev.seconds - 1 }
        if (prev.minutes > 0) return { ...prev, minutes: 59, seconds: 59 }
        if (prev.hours > 0) return { hours: prev.hours - 1, minutes: 59, seconds: 59 }
        return { hours: 23, minutes: 59, seconds: 59 }
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const nextSlide = useCallback(() => {
    setSlideDirection('next')
    setCurrentIdx((prev) => (prev + 1) % HERO_DATA.length)
  }, [])

  const prevSlide = useCallback(() => {
    setSlideDirection('prev')
    setCurrentIdx((prev) => (prev - 1 + HERO_DATA.length) % HERO_DATA.length)
  }, [])

  const goToSlide = (dotIdx: number) => {
    if (dotIdx === currentIdx) return
    setSlideDirection(dotIdx > currentIdx ? 'next' : 'prev')
    setCurrentIdx(dotIdx)
  }

  // Auto-advance every 4 seconds (as requested)
  useEffect(() => {
    if (isPaused) return
    const interval = setInterval(nextSlide, 4000)
    return () => clearInterval(interval)
  }, [isPaused, nextSlide])

  const slide = HERO_DATA[currentIdx]

  // Find linked product from props
  const linkedProduct = products.find((p) =>
    p.name.toLowerCase().includes(slide.productQuery.toLowerCase())
  )

  const handleOpenProduct = () => {
    if (linkedProduct) {
      onSelectProduct(linkedProduct)
    }
  }

  const handleAskBIXAboutHero = () => {
    onAskAI(`Tư vấn cho tôi về siêu phẩm ${slide.title}, có ưu đãi gì đặc biệt không?`)
  }

  const renderIcon = (type: 'cpu' | 'camera' | 'hz' | 'battery') => {
    switch (type) {
      case 'cpu':
        return <Cpu size={14} />
      case 'camera':
        return <Camera size={14} />
      case 'hz':
        return <Zap size={14} />
      case 'battery':
        return <Battery size={14} />
    }
  }

  return (
    <section
      className="hero-keynote-section"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      aria-label="Khám phá siêu phẩm nổi bật"
    >
      <div className="hero-stage-container">
        {/* FLASH SALE TICKER BAR */}
        <div className="hero-flash-ticker">
          <div className="ticker-label">
            <Flame size={18} color="#f97316" />
            <span>FLASH SALE 24H • ĐẶC QUYỀN MỞ BÁN SỚM</span>
          </div>
          <div className="ticker-countdown">
            <Clock size={15} />
            <span>Kết thúc sau:</span>
            <div className="timer-digits">
              <span className="digit-box">{String(timeLeft.hours).padStart(2, '0')}</span>:
              <span className="digit-box">{String(timeLeft.minutes).padStart(2, '0')}</span>:
              <span className="digit-box">{String(timeLeft.seconds).padStart(2, '0')}</span>
            </div>
          </div>
        </div>

        {/* MAIN HERO CARD */}
        <div className="hero-main-card cyber-stage">
          <div className="hero-hud-grid-overlay" />
          <div
            key={`hero-content-${currentIdx}`}
            className={`hero-content-col hero-slide-enter hero-slide-${slideDirection}`}
          >
            <div className="hero-cyber-badges-row">
              <span className="hero-tag-pill cyber-pill">{slide.label}</span>
              <span className="hero-tech-badge">{slide.techBadge}</span>
            </div>

            <h1 className="hero-headline">{slide.title}</h1>
            <p className="hero-tagline">{slide.tagline}</p>
            <p className="hero-description">{slide.desc}</p>

            {/* KEY SPEC CHIPS */}
            <div className="hero-specs-row">
              {slide.specChips.map((chip, idx) => (
                <div key={idx} className="hero-spec-pill cyber-pill-hover">
                  {renderIcon(chip.icon)}
                  <span>{chip.label}</span>
                </div>
              ))}
            </div>

            {/* DUAL ACTION BUTTONS */}
            <div className="hero-actions-row">
              <button
                type="button"
                className="btn-hero-primary cyber-cta-glow"
                onClick={handleOpenProduct}
              >
                <span>Khám phá siêu phẩm</span>
                <ArrowRight size={17} />
              </button>

              <button
                type="button"
                className="btn-hero-secondary cyber-ghost-btn"
                onClick={handleAskBIXAboutHero}
              >
                <Sparkles size={16} />
                <span>Tư vấn với BIX AI</span>
              </button>
            </div>
          </div>

          {/* RIGHT: FLOATING DEVICE SHOWCASE */}
          <div
            key={`hero-visual-${currentIdx}`}
            className={`hero-visual-col hero-device-enter hero-slide-${slideDirection}`}
            onClick={handleOpenProduct}
          >
            <div className="hud-radar-ring ring-outer" />
            <div className="hud-radar-ring ring-inner" />
            <div
              className="ambient-glow"
              style={{
                background: `radial-gradient(circle, ${slide.glowColor} 0%, rgba(255, 255, 255, 0) 70%)`,
              }}
            />
            <div className="device-showcase-box">
              <img
                src={slide.image}
                alt={slide.title}
                className="device-main-img"
                onError={(e) => {
                  ;(e.target as HTMLImageElement).src =
                    'https://thumb.wikimedia.org/wikipedia/commons/thumb/d/d2/IPhone_16_Pro_Vector.svg/960px-IPhone_16_Pro_Vector.svg.png'
                }}
              />
            </div>
          </div>

          {/* SLIDER CONTROLS */}
          <button
            type="button"
            className="slider-nav-btn prev"
            onClick={prevSlide}
            aria-label="Slide trước"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            type="button"
            className="slider-nav-btn next"
            onClick={nextSlide}
            aria-label="Slide tiếp theo"
          >
            <ChevronRight size={22} />
          </button>

          {/* PAGINATION DOTS */}
          <div className="hero-pagination-dots">
            {HERO_DATA.map((_, dotIdx) => (
              <button
                key={dotIdx}
                type="button"
                className={`pagination-dot ${currentIdx === dotIdx ? 'active' : ''}`}
                onClick={() => goToSlide(dotIdx)}
                aria-label={`Chuyển tới slide ${dotIdx + 1}`}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
