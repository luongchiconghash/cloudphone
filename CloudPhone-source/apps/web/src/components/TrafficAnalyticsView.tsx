import { useState } from 'react'
import { Activity, Eye, ShoppingBag, Users } from 'lucide-react'
import type { AdminTrafficReport } from '../api'

type Props = {
  report: AdminTrafficReport | null
  days: number
  loading: boolean
  onChangeDays: (days: 7 | 14 | 30) => void
}

const CHART_W = 760
const CHART_H = 260
const PAD = { top: 20, right: 20, bottom: 36, left: 42 }
const PLOT_W = CHART_W - PAD.left - PAD.right
const PLOT_H = CHART_H - PAD.top - PAD.bottom

export default function TrafficAnalyticsView({ report, days, loading, onChangeDays }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const summary = report?.summary
  const daily = report?.daily ?? []
  const events = report?.events ?? []
  const conversionRate = summary && summary.total_views > 0
    ? ((summary.total_checkouts / summary.total_views) * 100).toFixed(1)
    : '0.0'

  const maxMetric = Math.max(
    4,
    ...daily.map((d) => Math.max(d.page_views, d.visitors, d.interactions))
  )
  // Round up Y-axis ceiling to a clean multiple of 4
  const yMax = Math.ceil(maxMetric / 4) * 4
  const yTicks = [0, yMax * 0.25, yMax * 0.5, yMax * 0.75, yMax]

  const slotW = daily.length > 0 ? PLOT_W / daily.length : PLOT_W
  const barW = Math.max(4, Math.min(18, slotW * 0.3))
  const toY = (value: number) => PAD.top + PLOT_H - (value / yMax) * PLOT_H
  const centerX = (idx: number) => PAD.left + idx * slotW + slotW / 2

  const interactionPoints = daily
    .map((d, i) => `${centerX(i).toFixed(1)},${toY(d.interactions).toFixed(1)}`)
    .join(' ')

  const maxEventTotal = Math.max(1, ...events.map((e) => e.total))
  const labelStep = daily.length > 16 ? 3 : daily.length > 10 ? 2 : 1
  const hoveredDay = hoveredIdx !== null ? daily[hoveredIdx] : null

  return (
    <div className="traffic-page-stack">
      <section className="admin-kpi-grid" aria-label="Tổng quan lưu lượng truy cập" aria-busy={loading}>
        <article className="admin-kpi-card">
          <div className="admin-kpi-label"><span className="kpi-icon blue"><Eye size={18} /></span> Lượt xem hôm nay</div>
          <strong>{summary ? summary.today_views.toLocaleString('vi-VN') : '—'}</strong>
          <span>{summary ? `Tổng ${summary.total_views.toLocaleString('vi-VN')} lượt xem` : 'Đang tải số liệu'}</span>
        </article>
        <article className="admin-kpi-card">
          <div className="admin-kpi-label"><span className="kpi-icon green"><Users size={18} /></span> Khách truy cập hôm nay</div>
          <strong>{summary ? summary.today_visitors.toLocaleString('vi-VN') : '—'}</strong>
          <span>{summary ? `Tổng ${summary.total_visitors.toLocaleString('vi-VN')} khách duy nhất` : 'Đang tải số liệu'}</span>
        </article>
        <article className="admin-kpi-card">
          <div className="admin-kpi-label"><span className="kpi-icon amber"><Activity size={18} /></span> Tương tác hôm nay</div>
          <strong>{summary ? summary.today_interactions.toLocaleString('vi-VN') : '—'}</strong>
          <span>Xem máy, tìm kiếm, BIX AI, thêm giỏ</span>
        </article>
        <article className="admin-kpi-card">
          <div className="admin-kpi-label"><span className="kpi-icon purple"><ShoppingBag size={18} /></span> Tỷ lệ đặt hàng</div>
          <strong>{summary ? `${conversionRate}%` : '—'}</strong>
          <span>{summary ? `${summary.total_checkouts.toLocaleString('vi-VN')} đơn đặt thành công` : 'Trên tổng lượt truy cập'}</span>
        </article>
      </section>

      <div className="traffic-charts-grid">
        <section className="admin-panel-card traffic-chart-card" aria-labelledby="traffic-daily-chart-title">
          <div className="admin-panel-heading">
            <div>
              <h2 id="traffic-daily-chart-title">Biểu đồ lưu lượng theo ngày</h2>
              <span className="traffic-sub">Số liệu ghi nhận trực tiếp từ người dùng truy cập cửa hàng</span>
            </div>
            <div className="admin-filter-pills" role="group" aria-label="Khoảng thời gian">
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`admin-pill ${days === d ? 'active' : ''}`}
                  aria-pressed={days === d}
                  onClick={() => onChangeDays(d)}
                >
                  {d} ngày
                </button>
              ))}
            </div>
          </div>

          <div className="traffic-legend">
            <span><i className="legend-swatch views" /> Lượt xem trang</span>
            <span><i className="legend-swatch visitors" /> Khách duy nhất</span>
            <span><i className="legend-swatch interactions" /> Tương tác</span>
          </div>

          <div className="traffic-svg-wrap">
            <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} className="traffic-svg" role="img" aria-label="Biểu đồ cột và đường lưu lượng theo ngày">
              {yTicks.map((tick) => {
                const y = toY(tick)
                return (
                  <g key={tick}>
                    <line x1={PAD.left} y1={y} x2={CHART_W - PAD.right} y2={y} className="chart-grid-line" />
                    <text x={PAD.left - 8} y={y + 4} textAnchor="end" className="chart-axis-text">
                      {Math.round(tick)}
                    </text>
                  </g>
                )
              })}

              {daily.map((d, idx) => {
                const cx = centerX(idx)
                const viewsH = Math.max(0, PAD.top + PLOT_H - toY(d.page_views))
                const visH = Math.max(0, PAD.top + PLOT_H - toY(d.visitors))
                const showLabel = idx % labelStep === 0 || idx === daily.length - 1
                return (
                  <g
                    key={d.day}
                    className="chart-day-group"
                    onMouseEnter={() => setHoveredIdx(idx)}
                    onMouseLeave={() => setHoveredIdx(null)}
                  >
                    <rect
                      x={PAD.left + idx * slotW}
                      y={PAD.top}
                      width={slotW}
                      height={PLOT_H}
                      className={`chart-hover-band ${hoveredIdx === idx ? 'active' : ''}`}
                    />
                    <rect
                      x={cx - barW - 1.5}
                      y={toY(d.page_views)}
                      width={barW}
                      height={viewsH}
                      rx={3}
                      className="chart-bar-views"
                    />
                    <rect
                      x={cx + 1.5}
                      y={toY(d.visitors)}
                      width={barW}
                      height={visH}
                      rx={3}
                      className="chart-bar-visitors"
                    />
                    {showLabel && (
                      <text x={cx} y={CHART_H - 12} textAnchor="middle" className="chart-axis-text">
                        {d.label}
                      </text>
                    )}
                  </g>
                )
              })}

              {daily.length > 1 && (
                <polyline fill="none" points={interactionPoints} className="chart-line-interactions" />
              )}
              {daily.map((d, idx) => (
                <circle
                  key={`pt-${d.day}`}
                  cx={centerX(idx)}
                  cy={toY(d.interactions)}
                  r={hoveredIdx === idx ? 4.5 : 3}
                  className="chart-dot-interactions"
                />
              ))}
            </svg>

            <div className="traffic-chart-readout" aria-live="polite">
              {hoveredDay ? (
                <>
                  <strong>Ngày {hoveredDay.label} ({hoveredDay.day})</strong>
                  <span>Lượt xem: <b>{hoveredDay.page_views}</b></span>
                  <span>Khách: <b>{hoveredDay.visitors}</b></span>
                  <span>Tương tác: <b>{hoveredDay.interactions}</b></span>
                  <span>Thêm giỏ: <b>{hoveredDay.add_to_cart}</b></span>
                  <span>Đặt hàng: <b>{hoveredDay.checkouts}</b></span>
                </>
              ) : (
                <span>Di chuột vào cột ngày trên biểu đồ để xem chi tiết số liệu.</span>
              )}
            </div>
          </div>
        </section>

        <section className="admin-panel-card traffic-events-card" aria-labelledby="traffic-events-title">
          <div className="admin-panel-heading">
            <h2 id="traffic-events-title">Hành vi người dùng</h2>
            <span>Tổng / Hôm nay</span>
          </div>
          <div className="traffic-events-list">
            {events.map((ev) => {
              const pct = Math.round((ev.total / maxEventTotal) * 100)
              return (
                <div key={ev.event} className="traffic-event-row">
                  <div className="traffic-event-head">
                    <span>{ev.label}</span>
                    <strong>{ev.total.toLocaleString('vi-VN')} <small>({ev.today} hôm nay)</small></strong>
                  </div>
                  <div className="traffic-event-track">
                    <div className="traffic-event-fill" style={{ width: `${ev.total > 0 ? Math.max(4, pct) : 0}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>

      <section className="admin-panel-card" aria-labelledby="traffic-table-title">
        <div className="admin-panel-heading">
          <h2 id="traffic-table-title">Bảng thống kê chi tiết ({days} ngày gần nhất)</h2>
          <span>{daily.length} ngày</span>
        </div>
        <div className="admin-table-wrap" tabIndex={0}>
          <table className="admin-table traffic-detail-table">
            <thead>
              <tr>
                <th>Ngày</th>
                <th>Lượt xem trang</th>
                <th>Khách duy nhất</th>
                <th>Tương tác</th>
                <th>Thêm vào giỏ</th>
                <th>Đặt hàng thành công</th>
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((d) => (
                <tr key={d.day}>
                  <td><strong>{d.label}</strong> <span className="admin-prod-meta" style={{ display: 'inline' }}>({d.day})</span></td>
                  <td>{d.page_views.toLocaleString('vi-VN')}</td>
                  <td>{d.visitors.toLocaleString('vi-VN')}</td>
                  <td>{d.interactions.toLocaleString('vi-VN')}</td>
                  <td>{d.add_to_cart.toLocaleString('vi-VN')}</td>
                  <td>{d.checkouts.toLocaleString('vi-VN')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
