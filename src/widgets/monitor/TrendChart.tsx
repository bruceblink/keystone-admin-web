import { useEffect, useRef } from 'react'
import type { TrendPoint } from '../../entities/monitor/types'

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const chartElement = useRef<HTMLDivElement>(null)
  const hasSample = data.some((point) => point.cpu != null || point.memory != null)

  useEffect(() => {
    // 没有采样值时直接保留空状态，避免渲染误导性的空坐标轴。
    if (!hasSample) return undefined
    let chart: { setOption: (option: unknown) => void; resize: () => void; dispose: () => void } | null = null
    let disposed = false
    let resize: (() => void) | undefined

    async function loadChart() {
      const { createAreaGradient, initTrendChart } = await import('./echarts')
      if (disposed || !chartElement.current) return
      chart = initTrendChart(chartElement.current)
      chart.setOption({
        animation: false,
        grid: { top: 24, right: 18, bottom: 24, left: 40 },
        tooltip: { trigger: 'axis', backgroundColor: '#142033', borderColor: '#283a52', textStyle: { color: '#e7eef9' } },
        legend: { show: true, top: 0, right: 12, textStyle: { color: '#7e91ac', fontSize: 11 }, itemWidth: 14, itemHeight: 2 },
        xAxis: { type: 'category', boundaryGap: false, data: data.map((point) => new Date(point.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })), axisLine: { lineStyle: { color: '#22324a' } }, axisLabel: { color: '#6f829d', fontSize: 10, interval: 3 } },
        yAxis: { type: 'value', min: 0, max: 100, splitNumber: 4, axisLabel: { color: '#6f829d', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1b2a40' } } },
        series: [
          { name: 'CPU', type: 'line', smooth: true, showSymbol: false, data: data.map((point) => point.cpu), lineStyle: { width: 2, color: '#55d6e8' }, areaStyle: { color: createAreaGradient() }, markLine: { symbol: ['none', 'none'], silent: true, label: { show: true, color: '#f2bd63', fontSize: 10, formatter: '80% 关注阈值', position: 'insideEndTop' }, lineStyle: { color: '#f2bd63', type: 'dashed', width: 1 }, data: [{ yAxis: 80 }] } },
          { name: '内存', type: 'line', smooth: true, showSymbol: false, data: data.map((point) => point.memory), lineStyle: { width: 2, color: '#8797ff' } },
        ],
      })
      resize = () => chart?.resize()
      window.addEventListener('resize', resize)
    }

    void loadChart()
    return () => {
      disposed = true
      if (resize) window.removeEventListener('resize', resize)
      chart?.dispose()
    }
  }, [data, hasSample])

  if (!hasSample) {
    return <div className="trend-chart trend-chart-empty" role="status" aria-live="polite"><strong>暂无采样数据</strong><span>系统 API 尚未返回 CPU 或内存趋势。</span></div>
  }

  return <div ref={chartElement} className="trend-chart" role="img" aria-label={`CPU 和内存 30 分钟趋势图，共 ${data.length} 个采样点`} />
}
