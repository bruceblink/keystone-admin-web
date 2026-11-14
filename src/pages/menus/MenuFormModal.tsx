import { useEffect, useState } from 'react'
import { Button, Modal } from '../../shared/ui'
import type { NativeMenu, NativeMenuWriteInput } from '../../shared/api/schemas'

type Props = {
  open: boolean
  mode: 'create' | 'edit'
  menu: NativeMenu | null
  menus: NativeMenu[]
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: NativeMenuWriteInput) => Promise<void>
}

/** 菜单写入模态框；字段只描述 Native 当前接受的写入协议。 */
export function MenuFormModal({ open, mode, menu, menus, pending, error, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [parentId, setParentId] = useState('')
  const [path, setPath] = useState('')
  const [component, setComponent] = useState('')
  const [permission, setPermission] = useState('')
  const [menuType, setMenuType] = useState('MENU')
  const [sortOrder, setSortOrder] = useState('1')
  const [enabled, setEnabled] = useState(true)

  useEffect(() => {
    if (!open) return
    setName(menu?.name ?? '')
    setCode(menu?.code ?? '')
    setParentId(menu?.parentId ?? '')
    setPath(menu?.path ?? '')
    setComponent(menu?.component ?? '')
    setPermission(menu?.permission ?? '')
    setMenuType(menu?.menuType ?? 'MENU')
    setSortOrder(String(menu?.sortOrder ?? 1))
    setEnabled(menu?.enabled ?? true)
  }, [menu, open])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit({ name, code, parentId: parentId || null, path: path || null, component: component || null, permission: permission || null, menuType, sortOrder: Number(sortOrder) || 1, enabled })
  }

  return <Modal open={open} title={mode === 'create' ? '新增菜单' : '编辑菜单'} description="菜单权限会由 Native API 按当前主体权限再次校验。" onClose={pending ? () => undefined : onClose} size="lg" footer={<><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="menu-form" disabled={pending}>{pending ? '保存中…' : '保存菜单'}</Button></>}>
    <form id="menu-form" className="admin-form" onSubmit={submit}>
      {error ? <div className="modal-form-error" role="alert">{error}</div> : null}
      <div className="admin-form-grid"><label><span>菜单名称</span><input value={name} onChange={(event) => setName(event.target.value)} required disabled={pending} /></label><label><span>菜单编码</span><input value={code} onChange={(event) => setCode(event.target.value)} required disabled={pending} /></label><label><span>上级菜单</span><select value={parentId} onChange={(event) => setParentId(event.target.value)} disabled={pending}><option value="">根菜单</option>{menus.filter((item) => item.id !== menu?.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label><span>菜单类型</span><select value={menuType} onChange={(event) => setMenuType(event.target.value)} disabled={pending}><option value="MENU">菜单</option><option value="BUTTON">按钮</option></select></label><label><span>路由路径</span><input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/system/users" disabled={pending} /></label><label><span>组件路径</span><input value={component} onChange={(event) => setComponent(event.target.value)} placeholder="system/users/index" disabled={pending} /></label><label><span>权限标识</span><input value={permission} onChange={(event) => setPermission(event.target.value)} placeholder="user:read" disabled={pending} /></label><label><span>排序</span><input type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} disabled={pending} /></label></div>
      <label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={pending} /><span>启用菜单</span></label>
    </form>
  </Modal>
}
