import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import type { TrendPoint } from '../../entities/monitor/types'

export function TrendChart({ data }: { data: TrendPoint[] }) {
  const chartElement = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!chartElement.current) return
    const chart = echarts.init(chartElement.current, undefined, { renderer: 'svg' })
    chart.setOption({
      animation: false,
      grid: { top: 12, right: 18, bottom: 24, left: 40 },
      tooltip: { trigger: 'axis', backgroundColor: '#142033', borderColor: '#283a52', textStyle: { color: '#e7eef9' } },
      legend: { show: true, top: 0, right: 12, textStyle: { color: '#7e91ac', fontSize: 11 }, itemWidth: 14, itemHeight: 2 },
      xAxis: { type: 'category', boundaryGap: false, data: data.map((point) => new Date(point.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })), axisLine: { lineStyle: { color: '#22324a' } }, axisLabel: { color: '#6f829d', fontSize: 10, interval: 3 } },
      yAxis: { type: 'value', min: 0, max: 100, splitNumber: 4, axisLabel: { color: '#6f829d', fontSize: 10, formatter: '{value}%' }, splitLine: { lineStyle: { color: '#1b2a40' } } },
      series: [
        { name: 'CPU', type: 'line', smooth: true, showSymbol: false, data: data.map((point) => point.cpu), lineStyle: { width: 2, color: '#55d6e8' }, areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(85,214,232,.2)' }, { offset: 1, color: 'rgba(85,214,232,0)' }]) } },
        { name: '内存', type: 'line', smooth: true, showSymbol: false, data: data.map((point) => point.memory), lineStyle: { width: 2, color: '#8797ff' } },
      ],
    })
    const resize = () => chart.resize()
    window.addEventListener('resize', resize)
    return () => { window.removeEventListener('resize', resize); chart.dispose() }
  }, [data])

  return <div ref={chartElement} className="trend-chart" role="img" aria-label="CPU 和内存 30 分钟趋势图" />
}
