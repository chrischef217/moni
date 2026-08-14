import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_AUDIO_BYTES = 15 * 1024 * 1024
const DEFAULT_TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe'

function modelName() {
  return String(process.env.OPENAI_MONI_TRANSCRIBE_MODEL || DEFAULT_TRANSCRIBE_MODEL).trim()
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session) {
      return NextResponse.json({ ok: false, error: '로그인이 필요합니다.' }, { status: 401 })
    }

    const apiKey = String(process.env.OPENAI_API_KEY || '').trim()
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: 'MONI 음성 변환 설정을 확인할 수 없습니다.' }, { status: 503 })
    }

    const form = await request.formData()
    const audio = form.get('file')
    if (!audio || typeof audio === 'string') {
      return NextResponse.json({ ok: false, error: '음성 파일이 필요합니다.' }, { status: 400 })
    }
    if (audio.size <= 0) {
      return NextResponse.json({ ok: false, error: '녹음된 음성이 없습니다.' }, { status: 400 })
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ ok: false, error: '한 번의 음성 입력이 너무 깁니다. 조금 나누어 말씀해 주세요.' }, { status: 413 })
    }

    const upstream = new FormData()
    upstream.append('file', audio, audio.name || 'moni-voice.webm')
    upstream.append('model', modelName())
    upstream.append('language', 'ko')
    upstream.append('prompt', '한국어 공장 경영 업무 대화입니다. 주요 용어: MONI, 두배, 생산계획, 생산실적, 작업지시, LOT, 재고, 원재료, 매출, 매입, 수금, 지급, 미수금, 미지급금.')

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: upstream,
      cache: 'no-store',
    })

    const payload = await response.json().catch(() => null) as { text?: string; error?: { message?: string } } | null
    if (!response.ok) {
      console.error('[MONI_VOICE_TRANSCRIPTION_ERROR]', {
        status: response.status,
        message: payload?.error?.message || 'upstream transcription failed',
        user_login_id: session.loginId,
      })
      return NextResponse.json({ ok: false, error: '음성을 텍스트로 변환하지 못했습니다. 다시 시도해 주세요.' }, { status: 502 })
    }

    const transcript = String(payload?.text || '').replace(/\s+/g, ' ').trim()
    if (!transcript) {
      return NextResponse.json({ ok: false, error: '말씀하신 내용을 인식하지 못했습니다. 다시 시도해 주세요.' }, { status: 422 })
    }

    return NextResponse.json({
      ok: true,
      text: transcript,
      model: modelName(),
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    console.error('[MONI_VOICE_TRANSCRIPTION_ROUTE_ERROR]', {
      message: error instanceof Error ? error.message : 'unknown transcription route error',
    })
    return NextResponse.json({ ok: false, error: '음성 입력 처리 중 오류가 발생했습니다.' }, { status: 500 })
  }
}
