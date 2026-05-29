'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import AnalysisResult from './components/AnalysisResult'
import CategoryTabs from './components/CategoryTabs'
import FileList, { formatFileSize, type LocalAuditFile } from './components/FileList'
import UploadZone from './components/UploadZone'
import { AUDIT_CATEGORIES, AUDIT_CATEGORY_META, type AuditCategoryKey } from './lib/prompts'
import type { AuditAnalyzeResponse, AuditRecord, AuditRecordsResponse } from './lib/types'

const markdownClassName =
  'space-y-4 text-sm leading-7 text-gray-200 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-white [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white [&_p]:text-gray-200 [&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs [&_th]:border [&_th]:border-gray-700 [&_th]:bg-gray-900 [&_th]:px-2 [&_th]:py-1.5 [&_td]:border [&_td]:border-gray-800 [&_td]:px-2 [&_td]:py-1.5'

const ACCEPTED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp'])

function createEmptyFiles() {
  return AUDIT_CATEGORIES.reduce(
    (acc, category) => {
      acc[category.key] = []
      return acc
    },
    {} as Record<AuditCategoryKey, LocalAuditFile[]>,
  )
}

function makeId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isAcceptedFile(file: File) {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return (
    ACCEPTED_EXTENSIONS.has(ext) ||
    ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)
  )
}

function emptyCategoryMap<T>(value: T) {
  return Object.fromEntries(AUDIT_CATEGORIES.map((category) => [category.key, value])) as Record<
    AuditCategoryKey,
    T
  >
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Seoul',
  }).format(new Date(value))
}

function latestCompleted(records: AuditRecord[]) {
  const result = {} as Partial<Record<AuditCategoryKey, AuditRecord>>

  for (const category of AUDIT_CATEGORIES) {
    const record = records.find((item) => item.category === category.key && item.status === 'completed')
    if (record) result[category.key] = record
  }

  return result
}

function buildSummary(recordsByCategory: Partial<Record<AuditCategoryKey, AuditRecord>>) {
  return AUDIT_CATEGORIES.map((category) => {
    const record = recordsByCategory[category.key]
    return [
      `# ${category.label}`,
      record?.result?.trim() || '분석 결과 없음',
      record ? `첨부 파일: ${record.files.map((file) => file.originalName).join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n\n')
  }).join('\n\n---\n\n')
}

export default function AuditPage() {
  const [activeCategory, setActiveCategory] = useState<AuditCategoryKey>('tax')
  const [filesByCategory, setFilesByCategory] = useState<Record<AuditCategoryKey, LocalAuditFile[]>>(createEmptyFiles)
  const [records, setRecords] = useState<AuditRecord[]>([])
  const [results, setResults] = useState<Partial<Record<AuditCategoryKey, AuditRecord>>>({})
  const [loading, setLoading] = useState(emptyCategoryMap(false))
  const [progress, setProgress] = useState(emptyCategoryMap(0))
  const [errors, setErrors] = useState<Partial<Record<AuditCategoryKey, string>>>({})
  const [notice, setNotice] = useState('')
  const [summaryText, setSummaryText] = useState('')

  const activeMeta = AUDIT_CATEGORY_META[activeCategory]
  const activeFiles = filesByCategory[activeCategory]
  const activeRecord = results[activeCategory]
  const allDone = AUDIT_CATEGORIES.every((category) => Boolean(results[category.key]?.result))
  const latestRecordIds = AUDIT_CATEGORIES.map((category) => results[category.key]?.id).filter(Boolean).join(',')

  const fileCounts = useMemo(
    () =>
      Object.fromEntries(AUDIT_CATEGORIES.map((category) => [category.key, filesByCategory[category.key].length])) as Record<
        AuditCategoryKey,
        number
      >,
    [filesByCategory],
  )

  const completedCategories = useMemo(
    () =>
      Object.fromEntries(AUDIT_CATEGORIES.map((category) => [category.key, Boolean(results[category.key]?.result)])) as Partial<
        Record<AuditCategoryKey, boolean>
      >,
    [results],
  )

  useEffect(() => {
    let alive = true

    async function loadRecords() {
      try {
        const response = await fetch('/api/audit/records', { cache: 'no-store' })
        const payload = (await response.json()) as AuditRecordsResponse
        if (!alive) return

        if (payload.ok) {
          setRecords(payload.records)
          setResults(latestCompleted(payload.records))
        } else {
          setNotice(payload.error)
        }
      } catch (error) {
        if (alive) setNotice(error instanceof Error ? error.message : '감사 기록을 불러오지 못했습니다.')
      }
    }

    void loadRecords()
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!Object.values(loading).some(Boolean)) return

    const timer = window.setInterval(() => {
      setProgress((prev) => {
        const next = { ...prev }
        for (const category of AUDIT_CATEGORIES) {
          if (loading[category.key]) {
            next[category.key] = Math.min(92, (next[category.key] || 10) + Math.random() * 9)
          }
        }
        return next
      })
    }, 650)

    return () => window.clearInterval(timer)
  }, [loading])

  function addFiles(category: AuditCategoryKey, incomingFiles: File[]) {
    const accepted = incomingFiles.filter(isAcceptedFile)
    const rejected = incomingFiles.length - accepted.length

    setFilesByCategory((prev) => ({
      ...prev,
      [category]: [
        ...prev[category],
        ...accepted.map((file) => ({
          id: makeId(),
          file,
          addedAt: new Date().toISOString(),
        })),
      ],
    }))

    if (rejected > 0) {
      setNotice(`지원하지 않는 파일 ${rejected}개는 제외했습니다. PDF, JPG, PNG, WEBP만 가능합니다.`)
    } else if (accepted.length > 0) {
      setNotice(`${AUDIT_CATEGORY_META[category].label}에 ${accepted.length}개 파일을 추가했습니다.`)
    }
  }

  function removeFile(category: AuditCategoryKey, id: string) {
    setFilesByCategory((prev) => ({
      ...prev,
      [category]: prev[category].filter((item) => item.id !== id),
    }))
  }

  async function analyzeCategory(category: AuditCategoryKey) {
    const selectedFiles = filesByCategory[category]
    if (selectedFiles.length === 0 || loading[category]) {
      setErrors((prev) => ({ ...prev, [category]: '분석할 파일을 먼저 업로드해 주세요.' }))
      return
    }

    setErrors((prev) => ({ ...prev, [category]: undefined }))
    setLoading((prev) => ({ ...prev, [category]: true }))
    setProgress((prev) => ({ ...prev, [category]: 12 }))
    setNotice(`${AUDIT_CATEGORY_META[category].label} 분석을 시작했습니다.`)

    try {
      const formData = new FormData()
      formData.append('category', category)
      selectedFiles.forEach((item) => formData.append('files', item.file))

      const response = await fetch('/api/audit/analyze', {
        method: 'POST',
        body: formData,
      })
      const payload = (await response.json().catch(() => null)) as AuditAnalyzeResponse | null

      if (!response.ok || !payload?.ok) {
        const record = payload && !payload.ok ? payload.record : undefined
        if (record) setRecords((prev) => [record, ...prev.filter((item) => item.id !== record.id)])
        throw new Error(payload && !payload.ok ? payload.error : '분석 요청이 실패했습니다.')
      }

      setProgress((prev) => ({ ...prev, [category]: 100 }))
      setResults((prev) => ({ ...prev, [category]: payload.record }))
      setRecords((prev) => [payload.record, ...prev.filter((item) => item.id !== payload.record.id)])
      setNotice(`${AUDIT_CATEGORY_META[category].label} 분석이 완료되었습니다.`)
    } catch (error) {
      setErrors((prev) => ({
        ...prev,
        [category]: error instanceof Error ? error.message : '분석 중 오류가 발생했습니다.',
      }))
    } finally {
      setLoading((prev) => ({ ...prev, [category]: false }))
    }
  }

  async function copyText(text: string, label: string) {
    if (!text) return
    await navigator.clipboard.writeText(text)
    setNotice(`${label} 내용을 복사했습니다.`)
  }

  function openReport() {
    if (!latestRecordIds) return
    window.open(`/api/audit/report?recordIds=${encodeURIComponent(latestRecordIds)}`, '_blank', 'noopener,noreferrer')
  }

  function generateSummary() {
    const nextSummary = buildSummary(results)
    setSummaryText(nextSummary)
    void copyText(nextSummary, '요약 리포트')
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="sticky top-0 z-30 border-b border-gray-800 bg-gray-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:flex-row md:items-center md:justify-between md:px-6">
          <div>
            <Link href="/" className="text-sm font-semibold text-green-300">
              Moni
            </Link>
            <h1 className="mt-1 text-2xl font-bold text-white">재무감사 자료 분석</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openReport}
              disabled={!allDone}
              className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-green-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              감사 리포트 생성
            </button>
            <button
              type="button"
              onClick={generateSummary}
              disabled={!allDone}
              className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              요약 리포트 생성
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-5 px-4 py-6 md:px-6">
        <section className="grid gap-4 rounded-2xl border border-gray-800 bg-gray-900/70 p-5 md:grid-cols-[1.3fr_0.7fr]">
          <div>
            <p className="text-sm font-semibold text-green-300">두배 자체 회계감사</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-300">
              카테고리별 증빙을 업로드하면 서버에 원본을 보관하고, 한 번의 Claude 호출로 해당 묶음을 분석합니다.
              분석 기록과 첨부 파일은 아래 결과기록에서 다시 확인할 수 있습니다.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl border border-gray-800 bg-gray-950 p-3">
              <p className="text-xs text-gray-500">완료</p>
              <p className="mt-1 text-2xl font-bold text-green-300">
                {AUDIT_CATEGORIES.filter((category) => results[category.key]?.result).length}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-950 p-3">
              <p className="text-xs text-gray-500">선택 파일</p>
              <p className="mt-1 text-2xl font-bold text-white">
                {AUDIT_CATEGORIES.reduce((sum, category) => sum + filesByCategory[category.key].length, 0)}
              </p>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-950 p-3">
              <p className="text-xs text-gray-500">기록</p>
              <p className="mt-1 text-2xl font-bold text-white">{records.length}</p>
            </div>
          </div>
        </section>

        {notice ? (
          <div className="rounded-2xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-100">
            {notice}
          </div>
        ) : null}

        <CategoryTabs
          activeCategory={activeCategory}
          fileCounts={fileCounts}
          completedCategories={completedCategories}
          loadingCategories={loading}
          onChange={setActiveCategory}
        />

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-5">
            <div className="rounded-2xl border border-gray-800 bg-gray-800/70 p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-white">{activeMeta.label}</h2>
                  <p className="mt-1 text-sm text-gray-400">{activeMeta.description}</p>
                </div>
                <button
                  type="button"
                  onClick={() => void analyzeCategory(activeCategory)}
                  disabled={loading[activeCategory] || activeFiles.length === 0}
                  className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  분석하기
                </button>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
                <UploadZone
                  categoryLabel={activeMeta.label}
                  disabled={loading[activeCategory]}
                  onFilesAdded={(files) => addFiles(activeCategory, files)}
                />
                <FileList files={activeFiles} onRemove={(id) => removeFile(activeCategory, id)} />
              </div>
            </div>

            <AnalysisResult
              title={`${activeMeta.shortLabel} 분석 결과`}
              result={activeRecord?.result}
              error={errors[activeCategory] || activeRecord?.error}
              loading={loading[activeCategory]}
              progress={progress[activeCategory]}
              onCopy={() => void copyText(activeRecord?.result || '', `${activeMeta.label} 분석 결과`)}
            />
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-gray-800 bg-gray-800/70 p-5">
              <h2 className="text-lg font-semibold text-white">분석 현황</h2>
              <div className="mt-4 space-y-3">
                {AUDIT_CATEGORIES.map((category) => {
                  const record = results[category.key]
                  const currentLoading = loading[category.key]

                  return (
                    <div key={category.key} className="rounded-xl border border-gray-800 bg-gray-950/70 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-gray-100">{category.label}</span>
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            currentLoading
                              ? 'bg-amber-300/15 text-amber-100'
                              : record
                                ? 'bg-green-400/15 text-green-200'
                                : 'bg-gray-700 text-gray-300'
                          }`}
                        >
                          {currentLoading ? '분석중' : record ? '완료' : '대기'}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {record ? `${formatDate(record.createdAt)} · 파일 ${record.files.length}개` : category.description}
                      </p>
                    </div>
                  )
                })}
              </div>
            </section>

            <section className="rounded-2xl border border-gray-800 bg-gray-800/70 p-5">
              <h2 className="text-lg font-semibold text-white">자료량 그래프</h2>
              <div className="mt-4 space-y-3">
                {AUDIT_CATEGORIES.map((category) => {
                  const count = results[category.key]?.files.length || filesByCategory[category.key].length
                  const max = Math.max(
                    1,
                    ...AUDIT_CATEGORIES.map(
                      (item) => results[item.key]?.files.length || filesByCategory[item.key].length,
                    ),
                  )

                  return (
                    <div key={category.key} className="grid grid-cols-[56px_1fr_34px] items-center gap-3 text-xs">
                      <span className="text-gray-400">{category.shortLabel}</span>
                      <div className="h-2 overflow-hidden rounded-full bg-gray-950">
                        <div
                          className="h-full rounded-full bg-green-400"
                          style={{ width: `${Math.max(6, (count / max) * 100)}%` }}
                        />
                      </div>
                      <span className="text-right font-semibold text-gray-200">{count}</span>
                    </div>
                  )
                })}
              </div>
            </section>
          </aside>
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-800/70 p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">전체 결과 분석</h2>
              <p className="mt-1 text-sm text-gray-400">5개 카테고리 분석이 모두 완료되면 리포트 생성과 전체 복사가 활성화됩니다.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openReport}
                disabled={!allDone}
                className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-green-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                감사 리포트 생성
              </button>
              <button
                type="button"
                onClick={generateSummary}
                disabled={!allDone}
                className="rounded-xl bg-green-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                요약 리포트 생성
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl border border-gray-800">
            <div className="grid grid-cols-[1fr_120px_120px] bg-gray-950/80 px-4 py-3 text-xs font-semibold uppercase tracking-[0.08em] text-gray-500 md:grid-cols-[1fr_160px_120px_120px]">
              <span>카테고리</span>
              <span className="hidden md:block">분석일</span>
              <span className="text-right">파일</span>
              <span className="text-right">상태</span>
            </div>
            <div className="divide-y divide-gray-800">
              {AUDIT_CATEGORIES.map((category) => {
                const record = results[category.key]

                return (
                  <div
                    key={category.key}
                    className="grid grid-cols-[1fr_120px_120px] items-center gap-3 px-4 py-3 text-sm md:grid-cols-[1fr_160px_120px_120px]"
                  >
                    <span className="font-semibold text-gray-100">{category.label}</span>
                    <span className="hidden text-gray-400 md:block">{record ? formatDate(record.createdAt) : '-'}</span>
                    <span className="text-right text-gray-400">{record?.files.length ?? 0}개</span>
                    <span className="text-right text-gray-300">{record ? '완료' : '대기'}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {AUDIT_CATEGORIES.map((category) => {
              const record = results[category.key]

              return (
                <article key={category.key} className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                  <h3 className="text-base font-semibold text-white">{category.label}</h3>
                  {record ? (
                    <div className={`mt-3 ${markdownClassName}`}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{record.result}</ReactMarkdown>
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-gray-500">아직 분석 결과가 없습니다.</p>
                  )}
                </article>
              )
            })}
          </div>

          {summaryText ? (
            <div className="mt-5 rounded-2xl border border-green-500/20 bg-green-500/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="text-base font-semibold text-white">요약 리포트</h3>
                <button
                  type="button"
                  onClick={() => void copyText(summaryText, '요약 리포트')}
                  className="rounded-xl border border-green-500/50 px-3 py-2 text-sm font-semibold text-green-100 hover:bg-green-500/10"
                >
                  전체 복사
                </button>
              </div>
              <pre className="mt-3 max-h-[460px] overflow-auto whitespace-pre-wrap rounded-xl bg-gray-950 p-4 text-sm leading-6 text-gray-200">
                {summaryText}
              </pre>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-gray-800 bg-gray-800/70 p-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">결과기록</h2>
              <p className="mt-1 text-sm text-gray-400">분석 결과와 당시 첨부 파일을 다시 열람하고 내려받을 수 있습니다.</p>
            </div>
            <span className="text-sm text-gray-500">{records.length}건</span>
          </div>

          <div className="mt-5 space-y-3">
            {records.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-700 bg-gray-900/60 px-4 py-10 text-center text-sm text-gray-500">
                저장된 감사 기록이 없습니다.
              </div>
            ) : (
              records.map((record) => (
                <details key={record.id} className="rounded-2xl border border-gray-800 bg-gray-950/60 p-4">
                  <summary className="cursor-pointer list-none">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="font-semibold text-white">{record.categoryLabel}</p>
                        <p className="mt-1 text-sm text-gray-500">
                          {formatDate(record.createdAt)} · {record.files.length}개 파일 · {record.status === 'completed' ? '완료' : '실패'}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {record.files.map((file) => (
                          <a
                            key={file.id}
                            href={`/api/audit/files/${record.id}/${file.id}`}
                            className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:border-green-500 hover:text-white"
                          >
                            {file.originalName} · {formatFileSize(file.size)}
                          </a>
                        ))}
                      </div>
                    </div>
                  </summary>
                  <div className="mt-4 border-t border-gray-800 pt-4">
                    {record.error ? <p className="text-sm text-red-200">{record.error}</p> : null}
                    {record.result ? (
                      <div className={markdownClassName}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{record.result}</ReactMarkdown>
                      </div>
                    ) : null}
                  </div>
                </details>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  )
}
