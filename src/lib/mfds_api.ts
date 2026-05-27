type MfdsConfig = {
  apiKey: string
  companyId: string
  apiBase: string
}

type MfdsPingResult = {
  ok: boolean
  message: string
  checkedAt: string
}

type MfdsSyncResult = {
  ok: boolean
  syncedCount: number
  message: string
  checkedAt: string
}

function readEnv(name: string) {
  return process.env[name]?.trim() ?? ''
}

export function getMfdsConfig(): MfdsConfig {
  const apiKey = readEnv('MFDS_API_KEY')
  const companyId = readEnv('MFDS_COMPANY_ID')
  const apiBase = readEnv('MFDS_API_BASE') || 'https://openapi.foodsafetykorea.go.kr'

  if (!apiKey) {
    throw new Error('Missing required env: MFDS_API_KEY')
  }
  if (!companyId) {
    throw new Error('Missing required env: MFDS_COMPANY_ID')
  }

  return { apiKey, companyId, apiBase }
}

export function getMfdsConfigPreview() {
  const config = getMfdsConfig()
  const tail = config.apiKey.slice(-4)
  return {
    companyId: config.companyId,
    apiKeyMasked: `***${tail}`,
    apiBase: config.apiBase,
  }
}

export async function pingMfdsApi(): Promise<MfdsPingResult> {
  const config = getMfdsConfig()

  // 실서버 동기화 전 단계: 설정 검증 + 기본 연결성 확인만 수행
  const response = await fetch(config.apiBase, {
    method: 'GET',
    headers: {
      'x-api-key': config.apiKey,
      'x-company-id': config.companyId,
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    return {
      ok: false,
      message: `MFDS 연결 실패 (${response.status})`,
      checkedAt: new Date().toISOString(),
    }
  }

  return {
    ok: true,
    message: 'MFDS 연결 정상',
    checkedAt: new Date().toISOString(),
  }
}

export async function syncMfdsData(): Promise<MfdsSyncResult> {
  const ping = await pingMfdsApi()
  if (!ping.ok) {
    return {
      ok: false,
      syncedCount: 0,
      message: ping.message,
      checkedAt: ping.checkedAt,
    }
  }

  // 실제 MFDS 데이터 맵핑은 Sprint 6 다음 단계에서 확장
  return {
    ok: true,
    syncedCount: 0,
    message: '식약처 동기화 요청을 정상 처리했습니다. (초기 연결 모드)',
    checkedAt: new Date().toISOString(),
  }
}

