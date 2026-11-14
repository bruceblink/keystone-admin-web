import { useEffect, useState } from 'react'
import { Button, Modal } from '../../shared/ui'
import type { NativeJob, NativeJobWriteInput } from '../../shared/api/schemas'

type Props = {
  open: boolean
  mode: 'create' | 'edit'
  job: NativeJob | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSubmit: (input: NativeJobWriteInput) => Promise<void>
}

type FormValues = {
  code: string
  name: string
  group: string
  invokeTarget: string
  jobParams: string
  cron: string
  concurrent: boolean
  enabled: boolean
  remark: string
}

const emptyValues: FormValues = {
  code: '', name: '', group: 'DEFAULT', invokeTarget: '', jobParams: '', cron: '', concurrent: false, enabled: true, remark: '',
}

export function JobFormModal({ open, mode, job, pending, error, onClose, onSubmit }: Props) {
  const [values, setValues] = useState<FormValues>(emptyValues)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    // 每次打开模态框都从查询记录建立表单，避免取消后再次打开仍保留未保存内容。
    setValues(job ? {
      code: job.code, name: job.name, group: job.group, invokeTarget: job.invokeTarget,
      jobParams: job.jobParams ?? '', cron: job.cron, concurrent: job.concurrent, enabled: job.enabled, remark: job.remark ?? '',
    } : emptyValues)
    setValidationError(null)
  }, [job, open])

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }))
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (mode === 'create' && !values.code.trim()) return setValidationError('任务编码不能为空')
    if (!values.name.trim()) return setValidationError('任务名称不能为空')
    if (!values.invokeTarget.trim()) return setValidationError('调用目标不能为空')
    if (!values.cron.trim()) return setValidationError('Cron 表达式不能为空')
    void onSubmit({
      code: values.code.trim() || undefined,
      name: values.name.trim(),
      group: values.group.trim() || 'DEFAULT',
      invokeTarget: values.invokeTarget.trim(),
      jobParams: values.jobParams.trim() || null,
      cron: values.cron.trim(),
      concurrent: values.concurrent,
      enabled: values.enabled,
      remark: values.remark.trim() || null,
    })
  }

  return (
    <Modal open={open} size="lg" title={mode === 'create' ? '新增定时任务' : '编辑定时任务'} description="任务配置会写入 Native API，并按当前权限记录操作审计。" onClose={pending ? () => undefined : onClose} footer={(
      <><Button type="button" variant="ghost" onClick={onClose} disabled={pending}>取消</Button><Button type="submit" form="job-form" disabled={pending}>{pending ? '保存中…' : '保存任务'}</Button></>
    )}>
      <form id="job-form" className="admin-form" onSubmit={submit}>
        <div className="admin-form-grid">
          <label htmlFor="job-code"><span>任务编码{mode === 'create' ? ' *' : ''}</span><input id="job-code" value={values.code} onChange={(event) => update('code', event.target.value)} disabled={mode === 'edit' || pending} placeholder="例如 refresh-cache" autoComplete="off" /></label>
          <label htmlFor="job-name"><span>任务名称 *</span><input id="job-name" value={values.name} onChange={(event) => update('name', event.target.value)} disabled={pending} autoComplete="off" /></label>
          <label htmlFor="job-group"><span>任务分组</span><input id="job-group" value={values.group} onChange={(event) => update('group', event.target.value)} disabled={pending} placeholder="DEFAULT" autoComplete="off" /></label>
          <label htmlFor="job-cron"><span>Cron 表达式 *</span><input id="job-cron" value={values.cron} onChange={(event) => update('cron', event.target.value)} disabled={pending} placeholder="0/30 * * * * ?" autoComplete="off" /></label>
        </div>
        <label htmlFor="job-invoke-target"><span>调用目标 *</span><input id="job-invoke-target" value={values.invokeTarget} onChange={(event) => update('invokeTarget', event.target.value)} disabled={pending} placeholder="keystoneJob.heartbeat()" autoComplete="off" /></label>
        <label htmlFor="job-params"><span>任务参数 JSON</span><textarea id="job-params" value={values.jobParams} onChange={(event) => update('jobParams', event.target.value)} disabled={pending} rows={3} placeholder='例如 {"limit":100}' /></label>
        <div className="user-form-options">
          <label className="checkbox-label"><input type="checkbox" checked={values.concurrent} onChange={(event) => update('concurrent', event.target.checked)} disabled={pending} /><span>允许并发执行</span></label>
          <label className="checkbox-label"><input type="checkbox" checked={values.enabled} onChange={(event) => update('enabled', event.target.checked)} disabled={pending} /><span>任务启用</span></label>
        </div>
        <label htmlFor="job-remark"><span>备注</span><textarea id="job-remark" value={values.remark} onChange={(event) => update('remark', event.target.value)} disabled={pending} rows={2} /></label>
        {validationError || error ? <div className="modal-form-error" role="alert">{validationError ?? error}</div> : null}
      </form>
    </Modal>
  )
}
