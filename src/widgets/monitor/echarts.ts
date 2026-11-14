import * as echarts from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'

let configured = false

/** 只注册运行监控趋势图所需模块，避免加载 ECharts 其他图表类型。 */
export function initTrendChart(element: HTMLDivElement) {
  if (!configured) {
    echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer])
    configured = true
  }
  return echarts.init(element, undefined, { renderer: 'svg' })
}

export function createAreaGradient() {
  return new echarts.graphic.LinearGradient(0, 0, 0, 1, [
    { offset: 0, color: 'rgba(85,214,232,.2)' },
    { offset: 1, color: 'rgba(85,214,232,0)' },
  ])
}
