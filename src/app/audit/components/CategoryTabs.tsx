'use client'

import { AUDIT_CATEGORIES, type AuditCategoryKey } from '../lib/prompts'

type CategoryTabsProps = {
  activeCategory: AuditCategoryKey
  fileCounts: Record<AuditCategoryKey, number>
  completedCategories: Partial<Record<AuditCategoryKey, boolean>>
  loadingCategories: Partial<Record<AuditCategoryKey, boolean>>
  onChange: (category: AuditCategoryKey) => void
}

export default function CategoryTabs({
  activeCategory,
  fileCounts,
  completedCategories,
  loadingCategories,
  onChange,
}: CategoryTabsProps) {
  return (
    <div className="grid gap-2 md:grid-cols-5">
      {AUDIT_CATEGORIES.map((category) => {
        const active = activeCategory === category.key
        const done = Boolean(completedCategories[category.key])
        const loading = Boolean(loadingCategories[category.key])

        return (
          <button
            key={category.key}
            type="button"
            onClick={() => onChange(category.key)}
            className={`min-h-[112px] rounded-2xl border px-4 py-3 text-left transition ${
              active
                ? 'border-green-500 bg-green-500/12 shadow-[0_0_0_1px_rgba(34,197,94,0.25)]'
                : 'border-gray-800 bg-gray-800/70 hover:border-gray-600'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{category.label}</p>
                <p className="mt-1 text-xs leading-5 text-gray-400">{category.description}</p>
              </div>
              <span
                className={`mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${
                  loading ? 'bg-amber-300' : done ? 'bg-green-400' : 'bg-gray-600'
                }`}
              />
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-gray-400">
              <span>{fileCounts[category.key]}개 파일</span>
              <span>{loading ? '분석중' : done ? '완료' : '대기'}</span>
            </div>
          </button>
        )
      })}
    </div>
  )
}
