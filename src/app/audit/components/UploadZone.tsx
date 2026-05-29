'use client'

import { useRef, useState } from 'react'

type UploadZoneProps = {
  categoryLabel: string
  disabled?: boolean
  onFilesAdded: (files: File[]) => void
}

export default function UploadZone({ categoryLabel, disabled = false, onFilesAdded }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  function openPicker() {
    if (disabled) return
    inputRef.current?.click()
  }

  function addFiles(fileList: FileList | null) {
    if (!fileList || disabled) return
    onFilesAdded(Array.from(fileList))
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') openPicker()
      }}
      onDragEnter={(event) => {
        event.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        setDragging(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        addFiles(event.dataTransfer.files)
      }}
      className={`flex min-h-[210px] cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition ${
        dragging
          ? 'border-green-400 bg-green-500/10'
          : 'border-gray-700 bg-gray-900/70 hover:border-green-500/80 hover:bg-gray-900'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/webp,.pdf,.jpg,.jpeg,.png,.webp"
        onChange={(event) => addFiles(event.target.files)}
        className="hidden"
        disabled={disabled}
      />
      <div className="rounded-2xl border border-gray-700 bg-gray-950 px-4 py-3 text-sm font-semibold text-green-300">
        {categoryLabel}
      </div>
      <p className="mt-5 text-lg font-semibold text-white">파일을 놓거나 클릭해서 업로드</p>
      <p className="mt-2 text-sm text-gray-400">PDF, JPG, PNG, WEBP · 여러 파일 동시 선택 가능</p>
    </div>
  )
}
