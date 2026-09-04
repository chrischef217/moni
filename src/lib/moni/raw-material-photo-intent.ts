const compact = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()

export function isRawMaterialPhotoInboundRequest(message: unknown, recentContext: unknown = '') {
  const current = compact(message)
  const recent = compact(recentContext)
  if (!current) return false

  const rawWord = /(원재료|원료|식자재)/
  const inboundWord = /(입고|매입|수불|재고\s*입력|재고\s*등록)/
  const evidenceWord = /(사진|이미지|첨부|수량|개수|포장|박스|봉|포|중량|무게|유통기한|소비기한|사용기한|기한|EXP|BEST\s*BEFORE|USE\s*BY|LOT)/i
  const actionWord = /(등록|입력|기록|처리|반영|잡아|추가|저장|확인|파악|읽어|분석|체크|해줘|해주세요|해 줘)/

  if (rawWord.test(current) && (inboundWord.test(current) || evidenceWord.test(current))) return true
  if (inboundWord.test(current) && (evidenceWord.test(current) || actionWord.test(current))) return true

  const expiryFollowup = /(유통기한|소비기한|사용기한|기한|EXP|BEST\s*BEFORE|USE\s*BY|LOT)/i.test(current)
    && /(반영|입력|등록|추가|적용|저장|확인|읽어|봐|체크|해줘|해주세요|해 줘)/.test(current)
  const recentRawInbound = rawWord.test(recent) && /(입고|사진|포장수량|총\s*입고량|원재료\s*마스터)/.test(recent)
  if (expiryFollowup && recentRawInbound) return true

  const contextualPhotoAction = /^(?:이|그|저)?\s*(?:사진|이미지|거|것)?\s*(?:보고|봐서|확인해서)?\s*(?:입고|반영|등록|입력|처리)/.test(current)
  return contextualPhotoAction && recentRawInbound
}
