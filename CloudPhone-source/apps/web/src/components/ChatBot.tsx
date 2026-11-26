import { useState, useRef, useEffect } from 'react'
import {
  X,
  Send,
  Trash2,
  Sparkles,
  Bot,
  User,
  ThumbsUp,
  ThumbsDown,
  ShoppingCart,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'
import { api, vnd, type ChatMessage, type Product } from '../api'
import { trackStoreEvent } from '../utils/streamTracker'
import { showProductPlaceholder } from '../utils/productImage'

type Props = {
  open: boolean
  onClose: () => void
  onAddToCart: (product: Product) => void
  onViewProductDetails: (product: Product) => void
  initialPrompt?: string | null
  onClearInitialPrompt?: () => void
}

const DEFAULT_WELCOME: ChatMessage = {
  id: 'welcome_v2',
  sender: 'bot',
  text: 'Dạ em chào anh/chị! Em là **BIX** 🤖 - Trợ lý tư vấn điện thoại thông minh tại **CloudPhone**.\nEm có thể đối chiếu thông số chip, camera Leica/ZEISS, màn hình 144Hz, thời lượng pin và phân tích ngân sách để tìm ra chiếc máy phù hợp nhất cho mình. Anh/chị đang quan tâm nhu cầu nào ạ?',
  time: 'Vừa xong',
  suggestions: [
    '🎯 Con máy chụp ảnh đỉnh nhất?',
    '⚡ Máy chiến game Snapdragon 8 Elite',
    '📱 iPhone Duo & Z Fold8 màn gập',
    '💎 Tư vấn máy dưới 15 triệu đáng mua',
    '🛡️ Chính sách bảo hành VIP 1 đổi 1',
  ],
}

export default function ChatBot({
  open,
  onClose,
  onAddToCart,
  onViewProductDetails,
  initialPrompt,
  onClearInitialPrompt,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem('cloudphone_chat_messages_v4')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch {}
    return [DEFAULT_WELCOME]
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [typingHint, setTypingHint] = useState('Đang xem xét nhu cầu của bạn...')
  const [feedbacks, setFeedbacks] = useState<Record<string, 'up' | 'down'>>({})

  // Streaming Typewriter state
  const [streamingMsg, setStreamingMsg] = useState<{
    id: string
    fullText: string
    currentLength: number
    suggestions?: string[]
    products?: Product[]
    time: string
  } | null>(null)

  const streamIntervalRef = useRef<any>(null)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Save chat to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('cloudphone_chat_messages_v4', JSON.stringify(messages))
    } catch {}
  }, [messages])

  // Cycle thinking hint
  useEffect(() => {
    if (!loading) return
    const hints = [
      'Đang kiểm tra kho máy chính hãng...',
      'Đang đối chiếu thông số chipset và camera...',
      'Đang tổng hợp ưu đãi tốt nhất cho bạn...',
    ]
    let idx = 0
    const timer = setInterval(() => {
      idx = (idx + 1) % hints.length
      setTypingHint(hints[idx])
    }, 1800)
    return () => clearInterval(timer)
  }, [loading])

  // Scroll to bottom
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    chatEndRef.current?.scrollIntoView({ behavior })
  }

  useEffect(() => {
    if (open) {
      setTimeout(() => scrollToBottom('auto'), 100)
    }
  }, [open])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamingMsg, loading])

  // Handle Typewriter streaming effect
  useEffect(() => {
    if (!streamingMsg) return

    if (streamingMsg.currentLength < streamingMsg.fullText.length) {
      streamIntervalRef.current = setTimeout(() => {
        const step = Math.min(4, streamingMsg.fullText.length - streamingMsg.currentLength)
        setStreamingMsg((prev) =>
          prev ? { ...prev, currentLength: prev.currentLength + step } : null
        )
      }, 16)
    } else {
      const finalMsg: ChatMessage = {
        id: streamingMsg.id,
        sender: 'bot',
        text: streamingMsg.fullText,
        time: streamingMsg.time,
        suggestions: streamingMsg.suggestions,
        products: streamingMsg.products,
      }
      setMessages((prev) => [...prev, finalMsg])
      setStreamingMsg(null)
    }

    return () => {
      if (streamIntervalRef.current) clearTimeout(streamIntervalRef.current)
    }
  }, [streamingMsg])

  // Initial prompt trigger
  useEffect(() => {
    if (open && initialPrompt && initialPrompt.trim()) {
      handleSendMessage(initialPrompt.trim())
      if (onClearInitialPrompt) onClearInitialPrompt()
    }
  }, [open, initialPrompt])

  const handleClearHistory = () => {
    if (window.confirm('Bạn có chắc muốn xóa sạch lịch sử trò chuyện với BIX?')) {
      setMessages([DEFAULT_WELCOME])
      try {
        localStorage.removeItem('cloudphone_chat_messages_v4')
      } catch {}
    }
  }

  const handleFeedback = (msgId: string, type: 'up' | 'down') => {
    setFeedbacks((prev) => ({
      ...prev,
      [msgId]: prev[msgId] === type ? undefined! : type,
    }))
  }

  const handleSendMessage = async (userText: string) => {
    const textToSend = userText.trim()
    if (!textToSend || loading || streamingMsg) return

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      text: textToSend,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }

    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    // Ghi nhận sự kiện hỏi đáp AI BIX lên Basin Stream Ingest
    trackStoreEvent('chat_ai')

    try {
      const res = await api.chat(textToSend)
      setLoading(false)

      setStreamingMsg({
        id: crypto.randomUUID(),
        fullText: res.reply,
        currentLength: 0,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        suggestions: res.suggestions,
        products: res.products,
      })
    } catch {
      setLoading(false)
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          sender: 'bot',
          text: 'Dạ rất tiếc, đường truyền tư vấn tạm thời bận. Bạn có thể gửi lại câu hỏi ngay bây giờ nhé ạ!',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ])
    }
  }

  const renderFormattedText = (raw: string) => {
    const lines = raw.split('\n')
    return lines.map((line, idx) => {
      const parts = line.split(/\*\*(.*?)\*\*/g)
      return (
        <span key={idx} style={{ display: 'block', minHeight: line.trim() ? 'auto' : '8px' }}>
          {parts.map((part, i) => i % 2 === 1 ? <strong key={i}>{part}</strong> : part)}
        </span>
      )
    })
  }

  if (!open) return null

  return (
    <div className="drawer-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <aside className="chat-drawer" onClick={(e) => e.stopPropagation()} aria-label="Trợ lý BIX AI">
        {/* CHAT HEADER */}
        <div className="chat-header">
          <div className="bot-info-wrap">
            <div className="bot-avatar-badge">
              <Bot size={20} />
              <span className="online-indicator" />
            </div>
            <div>
              <div className="bot-title-row">
                <strong>BIX Assistant</strong>
                <span className="model-chip cyber-chip">Tư vấn AI 24/7</span>
              </div>
              <p className="bot-subtitle">AI Flagship Specialist • Tư vấn chuẩn xác 24/7</p>
            </div>
          </div>

          <div className="header-ctrl-buttons">
            <button
              type="button"
              className="chat-action-btn"
              onClick={handleClearHistory}
              title="Xóa lịch sử chat"
            >
              <Trash2 size={16} />
            </button>
            <button
              type="button"
              className="chat-action-btn"
              onClick={onClose}
              title="Đóng chat"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* MESSAGES LIST */}
        <div className="chat-messages-container">
          {messages.map((m) => (
            <div key={m.id} className={`chat-message-row ${m.sender}`}>
              <div className="msg-avatar">
                {m.sender === 'bot' ? <Bot size={16} /> : <User size={16} />}
              </div>

              <div className="msg-content-wrap">
                <div className={`msg-bubble ${m.sender}`}>
                  <div className="msg-text">{renderFormattedText(m.text)}</div>
                  <span className="msg-timestamp">{m.time}</span>
                </div>

                {/* BOT FEEDBACK BUTTONS */}
                {m.sender === 'bot' && m.id !== 'welcome_v2' && (
                  <div className="msg-feedback-bar">
                    <button
                      type="button"
                      className={`feedback-btn ${feedbacks[m.id] === 'up' ? 'active' : ''}`}
                      onClick={() => handleFeedback(m.id, 'up')}
                      title="Câu trả lời hữu ích"
                    >
                      <ThumbsUp size={12} />
                    </button>
                    <button
                      type="button"
                      className={`feedback-btn ${feedbacks[m.id] === 'down' ? 'active' : ''}`}
                      onClick={() => handleFeedback(m.id, 'down')}
                      title="Chưa hài lòng"
                    >
                      <ThumbsDown size={12} />
                    </button>
                  </div>
                )}

                {/* INLINE RECOMMENDED PRODUCTS */}
                {m.products && m.products.length > 0 && (
                  <div className="chat-products-carousel">
                    {m.products.map((p) => (
                      <div key={p.id} className="chat-product-card">
                        <div
                          className="chat-p-thumb"
                          onClick={() => onViewProductDetails(p)}
                        >
                          <img
                            src={p.image}
                            alt={p.name}
                            onError={showProductPlaceholder}
                          />
                        </div>
                        <div className="chat-p-info">
                          <span className="chat-p-brand">{p.brand}</span>
                          <h5
                            className="chat-p-name"
                            onClick={() => onViewProductDetails(p)}
                          >
                            {p.name}
                          </h5>
                          <span className="chat-p-price">{vnd(p.price)}</span>
                          <button
                            type="button"
                            className="chat-p-add-btn"
                            onClick={() => onAddToCart(p)}
                          >
                            <ShoppingCart size={12} />
                            <span>Thêm giỏ</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* SMART SUGGESTION CHIPS */}
                {m.suggestions && m.suggestions.length > 0 && (
                  <div className="chat-suggestions-group">
                    {m.suggestions.map((sug, sIdx) => (
                      <button
                        key={sIdx}
                        type="button"
                        className="suggestion-chip"
                        onClick={() => handleSendMessage(sug)}
                      >
                        <Sparkles size={12} />
                        <span>{sug}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* STREAMING MESSAGE */}
          {streamingMsg && (
            <div className="chat-message-row bot streaming">
              <div className="msg-avatar">
                <Bot size={16} />
              </div>
              <div className="msg-content-wrap">
                <div className="msg-bubble bot">
                  <div className="msg-text">
                    {renderFormattedText(
                      streamingMsg.fullText.slice(0, streamingMsg.currentLength)
                    )}
                    <span className="streaming-cursor">▍</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* THINKING ANIMATION */}
          {loading && (
            <div className="chat-message-row bot thinking">
              <div className="msg-avatar">
                <Bot size={16} />
              </div>
              <div className="thinking-bubble">
                <div className="wave-bars">
                  <span className="wave-bar" />
                  <span className="wave-bar" />
                  <span className="wave-bar" />
                  <span className="wave-bar" />
                </div>
                <span className="thinking-text">{typingHint}</span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </div>

        {/* INPUT FORM */}
        <form
          className="chat-input-form"
          onSubmit={(e) => {
            e.preventDefault()
            handleSendMessage(input)
          }}
        >
          <div className="input-field-wrap">
            <input
              type="text"
              placeholder="Hỏi BIX (VD: tư vấn máy chụp ảnh, chiến game...)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading || !!streamingMsg}
            />
            <button
              type="submit"
              className="btn-send-message"
              disabled={!input.trim() || loading || !!streamingMsg}
              aria-label="Gửi tin nhắn"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
      </aside>
    </div>
  )
}
