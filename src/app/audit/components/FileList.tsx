'use client'

export type LocalAuditFile = {
  id: string
  file: File
  addedAt: string
}

export function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

type FileListProps = {
  files: LocalAuditFile[]
  onRemove: (id: string) => void
}

export default function FileList({ files, onRemove }: FileListProps) {
  if (files.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-800 bg-gray-900/50 px-4 py-5 text-sm text-gray-500">
        아직 선택된 파일이 없습니다.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-800">
      <div className="grid grid-cols-[1fr_110px_72px] bg-gray-950/70 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
        <span>파일명</span>
        <span className="text-right">크기</span>
        <span className="text-right">삭제</span>
      </div>
      <div className="divide-y divide-gray-800">
        {files.map((item) => (
          <div
            key={item.id}
            className="grid grid-cols-[1fr_110px_72px] items-center gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium text-gray-100">{item.file.name}</p>
              <p className="mt-1 text-xs text-gray-500">{item.file.type || '알 수 없는 형식'}</p>
            </div>
            <span className="text-right text-gray-400">{formatFileSize(item.file.size)}</span>
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-300 transition hover:border-red-400 hover:text-red-200"
            >
              삭제
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
