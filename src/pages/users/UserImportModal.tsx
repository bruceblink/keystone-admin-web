import { useEffect, useRef, useState } from 'react'
import { FileSpreadsheet, Upload } from 'lucide-react'
import type { NativeUserImportResult } from '../../shared/api/schemas'
import { isXlsxFilename } from '../../shared/api/client'
import { ActionError, Button, Modal, Spinner } from '../../shared/ui'

type UserImportModalProps = {
  open: boolean
  pending: boolean
  result: NativeUserImportResult | null
  error: unknown
  onClose: () => void
  onSubmit: (file: File) => void
}

/** 用户 XLSX 导入流程；选择、提交、结果和失败行都在同一模态框内完成。 */
export function UserImportModal({ open, pending, result, error, onClose, onSubmit }: UserImportModalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setFile(null)
      setValidationError(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }, [open])

  function chooseFile() {
    inputRef.current?.click()
  }

  function selectFile(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null
    if (!selected) return
    if (!isXlsxFilename(selected.name)) {
      setFile(null)
      setValidationError('只支持 Excel Open XML 文件（.xlsx），不支持 .xls 或 .csv。')
      event.target.value = ''
      return
    }
    setValidationError(null)
    setFile(selected)
  }

  function submit() {
    if (!file) {
      setValidationError('请先选择一个 .xlsx 文件。')
      return
    }
    onSubmit(file)
  }

  return (
    <Modal
      open={open}
      title="导入用户"
      description="上传 Excel Open XML 工作簿。系统会按行校验并返回失败行。"
      size="lg"
      onClose={() => { if (!pending) onClose() }}
      footer={(
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>关闭</Button>
          <Button onClick={submit} disabled={pending || !file}>
            {pending ? <><Spinner label="正在导入" />处理中</> : <><Upload size={15} />开始导入</>}
          </Button>
        </>
      )}
    >
      <div className="user-import-panel">
        <input
          ref={inputRef}
          className="sr-only"
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          aria-label="选择 XLSX 文件"
          onChange={selectFile}
          disabled={pending}
        />
        <button type="button" className="user-import-picker" onClick={chooseFile} disabled={pending}>
          <FileSpreadsheet size={22} />
          <span><strong>{file ? file.name : '选择 .xlsx 文件'}</strong><small>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : '仅支持 Excel Open XML（.xlsx）'}</small></span>
        </button>

        {validationError ? <div className="modal-form-error" role="alert">{validationError}</div> : null}
        <ActionError title="用户导入失败" error={error} />

        {result ? (
          <section className="user-import-result" aria-label="导入结果">
            <div className="user-import-summary">
              <span><strong>{result.success}</strong><small>成功</small></span>
              <span><strong>{result.failed.length}</strong><small>失败</small></span>
              <span><strong>{result.total}</strong><small>总行数</small></span>
            </div>
            {result.failed.length > 0 ? (
              <div className="user-import-failures">
                <h3>失败行</h3>
                <div className="user-import-failures-wrap">
                  <table>
                    <thead><tr><th scope="col">行号</th><th scope="col">用户名</th><th scope="col">原因</th></tr></thead>
                    <tbody>{result.failed.map((failure) => <tr key={`${failure.row}-${failure.username}`}><td>{failure.row}</td><td>{failure.username || '—'}</td><td>{failure.reason}</td></tr>)}</tbody>
                  </table>
                </div>
              </div>
            ) : <p className="user-import-success">全部数据已成功导入。</p>}
          </section>
        ) : <p className="user-import-hint">导入要求当前登录会话完成 AAL2 验证，API Key 不能执行此操作。</p>}
      </div>
    </Modal>
  )
}
