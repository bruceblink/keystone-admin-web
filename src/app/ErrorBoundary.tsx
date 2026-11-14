import { Component, type PropsWithChildren } from 'react'
import { Activity, LogIn, RefreshCw, ShieldAlert } from 'lucide-react'
import { Button } from '../shared/ui'

type ErrorBoundaryState = {
  hasError: boolean
}

/**
 * 捕获渲染和图表初始化异常，保留可读的恢复路径，不让单个工作区崩溃成空白页面。
 */
export class ErrorBoundary extends Component<PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  handleReload = () => {
    window.location.reload()
  }

  handleLogin = () => {
    window.location.assign('/login')
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <main className="error-boundary" role="alert">
        <div className="error-boundary-card">
          <div className="brand-mark"><Activity size={19} /></div>
          <ShieldAlert className="error-boundary-icon" size={32} aria-hidden="true" />
          <p className="eyebrow">KEYSTONE NATIVE / RECOVERY</p>
          <h1>工作台暂时无法显示</h1>
          <p>页面组件遇到未预期错误。刷新页面可以重新建立查询和图表状态；如果会话已失效，请返回登录页。</p>
          <div className="error-boundary-actions">
            <Button onClick={this.handleReload}><RefreshCw size={16} /> 重新加载</Button>
            <Button variant="secondary" onClick={this.handleLogin}><LogIn size={16} /> 返回登录</Button>
          </div>
        </div>
      </main>
    )
  }
}
