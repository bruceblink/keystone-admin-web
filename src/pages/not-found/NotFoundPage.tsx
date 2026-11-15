import { useNavigate } from 'react-router-dom'
import { Button, Card } from '../../shared/ui'

/** 受保护路由的明确错误页，避免未知地址静默显示监控数据。 */
export function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <Card className="error-panel">
      <div>
        <strong>页面不存在</strong>
        <p>请从管理导航选择有效页面。</p>
      </div>
      <Button variant="secondary" size="sm" onClick={() => navigate('/monitor', { replace: true })}>返回运行监控</Button>
    </Card>
  )
}
