import { NextRequest, NextResponse } from 'next/server'
import { getSessionFromRequest } from '@/lib/allowance/session'
import { readAllowanceState } from '@/lib/allowance/store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const session = await getSessionFromRequest(request)
    if (!session || session.role !== 'freelancer' || !session.freelancerId) {
      return NextResponse.json({ ok: false, error: '프리랜서 권한이 필요합니다.' }, { status: 403 })
    }

    const state = await readAllowanceState()
    const freelancer = state.freelancers.find((item) => item.id === session.freelancerId)

    if (!freelancer) {
      return NextResponse.json({ ok: false, error: '프리랜서 정보를 찾을 수 없습니다.' }, { status: 404 })
    }

    const payRecords = state.payRecords
      .filter((record) => record.freelancer_id === freelancer.id)
      .sort((a, b) => (b.year - a.year) || (b.month - a.month))
      .map((record) => {
        const details = record.details.map((detail) => {
          const product = state.products.find((item) => item.id === detail.product_id)
          const client = product ? state.clients.find((item) => item.id === product.client_id) : null

          return {
            id: detail.id,
            product_id: detail.product_id,
            quantity_kg: detail.quantity_kg,
            amount: detail.amount,
            product_name: product?.name ?? '',
            price_per_kg: product?.price_per_kg ?? 0,
            client_name: client?.name ?? '',
          }
        })

        return {
          ...record,
          details,
        }
      })

    return NextResponse.json(
      {
        ok: true,
        data: {
          company: state.company,
          payment_day: state.payment_day,
          freelancer: {
            ...freelancer,
            password: '',
          },
          payRecords,
        },
      },
      { status: 200 },
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : '정산 데이터를 불러오지 못했습니다.'
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
