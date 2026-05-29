'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const markdownClassName =
  'mt-5 space-y-4 text-sm leading-7 text-gray-200 [&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:text-white [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-white [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-white [&_p]:text-gray-200 [&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm [&_th]:border [&_th]:border-gray-700 [&_th]:bg-gray-950 [&_th]:px-3 [&_th]:py-2 [&_td]:border [&_td]:border-gray-800 [&_td]:px-3 [&_td]:py-2'

type AnalysisResultProps = {
  title: string
  result?: string
  error?: string
  loading?: boolean
  progress?: number
  onCopy: () => void
}

export default function AnalysisResult({
  title,
  result,
  error,
  loading = false,
  progress = 0,
  onCopy,
}: AnalysisResultProps) {
  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-800/70 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-white">{title}</h2>
          <p className="mt-1 text-sm text-gray-400">Claude 분석 결과는 완료 후 이 영역에 유지됩니다.</p>
        </div>
        <button
          type="button"
          onClick={onCopy}
          disabled={!result || loading}
          className="rounded-xl border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-200 transition hover:border-green-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          복사
        </button>
      </div>

      {loading ? (
        <div className="mt-5 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-amber-100">분석중</span>
            <span className="text-amber-100">{Math.round(progress)}%</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-gray-950">
            <div
              className="h-full rounded-full bg-amber-300 transition-all duration-500"
              style={{ width: `${Math.max(8, Math.min(progress, 100))}%` }}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <div className="mt-5 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm leading-6 text-red-100">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className={markdownClassName}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
        </div>
      ) : !loading && !error ? (
        <div className="mt-5 rounded-2xl border border-dashed border-gray-700 bg-gray-900/60 px-4 py-10 text-center text-sm text-gray-500">
          분석 결과가 아직 없습니다.
        </div>
      ) : null}
    </section>
  )
}
