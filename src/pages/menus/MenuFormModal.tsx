import { useEffect, useState } from 'react'
import { Button, Modal } from '../../shared/ui'
import type { NativeMenu, NativeMenuWriteInput, NativeRole } from '../../shared/api/schemas'

type Props = {
  open: boolean
  mode: 'create' | 'edit'
  menu: NativeMenu | null
  menus: NativeMenu[]
  pending: boolean
  error: string | null
  roles: NativeRole[]
  roleCodes: string[]
  rolesLoading: boolean
  onClose: () => void
  onSubmit: (input: NativeMenuWriteInput, roleCodes: string[]) => Promise<void>
}

/** 菜单写入模态框；字段只描述 Native 当前接受的写入协议。 */
export function MenuFormModal({ open, mode, menu, menus, pending, error, roles, roleCodes, rolesLoading, onClose, onSubmit }: Props) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [parentId, setParentId] = useState('')
  const [path, setPath] = useState('')
  const [component, setComponent] = useState('')
  const [permission, setPermission] = useState('')
  const [menuType, setMenuType] = useState('MENU')
  const [sortOrder, setSortOrder] = useState('1')
  const [enabled, setEnabled] = useState(true)
  const [selectedRoleCodes, setSelectedRoleCodes] = useState<string[]>([])
  const roleCodeKey = roleCodes.join('\u0000')

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
    setSelectedRoleCodes(roleCodeKey ? roleCodeKey.split('\u0000') : [])
  }, [menu, open, roleCodeKey])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await onSubmit({ name, code, parentId: parentId || null, path: path || null, component: component || null, permission: permission || null, menuType, sortOrder: Number(sortOrder) || 1, enabled }, selectedRoleCodes)
  }

  const menuById = new Map(menus.map((item) => [item.id, item]))
  const descendantIds = menu ? descendantsOf(menu.id, menus) : new Set<string>()
  const parentOptions = menus.filter((item) => item.id !== menu?.id && !descendantIds.has(item.id))

  return <Modal open={open} title={mode === 'create' ? '新增菜单' : '编辑菜单'} description="菜单权限会由系统 API 按当前主体权限再次校验。" onClose={pending ? () => undefined : onClose} size="lg" footer={<><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="menu-form" disabled={pending}>{pending ? '保存中…' : '保存菜单'}</Button></>}>
    <form id="menu-form" className="admin-form" onSubmit={submit}>
      {error ? <div className="modal-form-error" role="alert">{error}</div> : null}
      <div className="admin-form-grid"><label><span>菜单名称</span><input value={name} onChange={(event) => setName(event.target.value)} required disabled={pending} /></label><label><span>菜单编码</span><input value={code} onChange={(event) => setCode(event.target.value)} required disabled={pending} /></label><label><span>上级菜单</span><select value={parentId} onChange={(event) => setParentId(event.target.value)} disabled={pending}><option value="">根菜单</option>{parentOptions.map((item) => <option key={item.id} value={item.id}>{'　'.repeat(menuDepth(item.id, menuById))}{item.name}</option>)}</select></label><label><span>菜单类型</span><select value={menuType} onChange={(event) => setMenuType(event.target.value)} disabled={pending}><option value="MENU">菜单</option><option value="BUTTON">按钮</option></select></label><label><span>路由路径</span><input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/system/users" disabled={pending} /></label><label><span>组件路径</span><input value={component} onChange={(event) => setComponent(event.target.value)} placeholder="system/users/index" disabled={pending} /></label><label><span>权限标识</span><input value={permission} onChange={(event) => setPermission(event.target.value)} placeholder="user:read" disabled={pending} /></label><label><span>排序</span><input type="number" min="0" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} disabled={pending} /></label></div>
      <label className="checkbox-label"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} disabled={pending} /><span>启用菜单</span></label>
      <fieldset className="menu-role-access" disabled={pending || rolesLoading}>
        <legend>可访问角色</legend>
        {rolesLoading ? <p className="form-help">正在读取角色权限…</p> : roles.length === 0 ? <p className="form-help">暂无可分配角色。</p> : <div className="menu-role-options">{roles.map((role) => <label className="checkbox-label" key={role.id}><input type="checkbox" checked={selectedRoleCodes.includes(role.code)} onChange={(event) => setSelectedRoleCodes((current) => event.target.checked ? [...new Set([...current, role.code])] : current.filter((code) => code !== role.code))} /><span>{role.name} <small>{role.code}</small></span></label>)}</div>}
        <p className="form-help">保存后会替换该菜单的角色绑定。未选择角色时，菜单不会显示给任何角色。</p>
      </fieldset>
    </form>
  </Modal>
}

function descendantsOf(menuId: string, menus: NativeMenu[]): Set<string> {
  const descendants = new Set<string>()
  let frontier = [menuId]
  while (frontier.length > 0) {
    const children = menus.filter((item) => item.parentId && frontier.includes(item.parentId) && !descendants.has(item.id))
    children.forEach((child) => descendants.add(child.id))
    frontier = children.map((child) => child.id)
  }
  return descendants
}

function menuDepth(menuId: string, menus: Map<string, NativeMenu>): number {
  let depth = 0
  let current = menus.get(menuId)
  const seen = new Set<string>()
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id)
    depth += 1
    current = menus.get(current.parentId)
  }
  return depth
}
