import { NextRequest, NextResponse } from 'next/server'
import { GET as legacyGET, POST as legacyPOST } from '../sales-return-credit/route'
import { createMoniServiceRoleClient } from '@/lib/moni/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const text=(value:unknown)=>String(value??'').trim()
const isAccessory=(item:any)=>!text(item?.product_id)&&!text(item?.sales_variant_id)&&text(item?.specification)==='기타비용'

export async function GET(request:NextRequest){
  const response=await legacyGET(request)
  const payload=await response.json() as any
  if(!response.ok||!payload?.ok)return NextResponse.json(payload,{status:response.status,headers:{'Cache-Control':'no-store'}})
  if(Array.isArray(payload.originals))payload.originals=payload.originals.map((order:any)=>({...order,items:Array.isArray(order.items)?order.items.filter((item:any)=>!isAccessory(item)):[]}))
  return NextResponse.json(payload,{status:response.status,headers:{'Cache-Control':'no-store'}})
}

export async function POST(request:NextRequest){
  const body=await request.json().catch(()=>null) as Record<string,any>|null
  if(!body)return NextResponse.json({ok:false,error:'저장할 데이터가 없습니다.'},{status:400})
  if(text(body?.data?.adjustment_type).toUpperCase()==='RETURN'&&Array.isArray(body?.data?.items)){
    const ids=body.data.items.map((row:any)=>text(row?.original_order_item_id)).filter(Boolean)
    if(ids.length){
      const client=createMoniServiceRoleClient()
      const result=await client.from('sales_order_items').select('id,product_id,sales_variant_id,specification').in('id',ids)
      if(result.error)return NextResponse.json({ok:false,error:result.error.message},{status:500})
      const invalid=(result.data??[]).find((item:any)=>isAccessory(item))
      if(invalid)return NextResponse.json({ok:false,error:'택배비·운임·포장비 등 기타비용은 제품 반품 수량으로 처리할 수 없습니다. 필요한 경우 금액 차감을 사용해 주세요.'},{status:400})
    }
  }
  const forwarded=new NextRequest(request.url,{method:'POST',headers:request.headers,body:JSON.stringify(body)})
  return legacyPOST(forwarded)
}
