import type { Viewport } from 'next'
import { redirect } from 'next/navigation'
import AllowanceLogin from '@/components/AllowanceLogin'
import MoniMobileAnswerActions from '@/components/MoniMobileAnswerActions'
import MoniMobileBusyRecovery from '@/components/MoniMobileBusyRecovery'
import MoniMobileBusinessCards from '@/components/MoniMobileBusinessCards'
import MoniMobileCapabilityV4 from '@/components/MoniMobileCapabilityV4'
import MoniMobileChat from '@/components/MoniMobileChat'
import MoniMobileContinuityGuard from '@/components/MoniMobileContinuityGuard'
import MoniMobileDocumentSaveUX from '@/components/MoniMobileDocumentSaveUX'
import MoniMobileExtendedFormCard from '@/components/MoniMobileExtendedFormCard'
import MoniMobileExportWorkflowGuard from '@/components/MoniMobileExportWorkflowGuard'
import MoniMobileFormSafetyStyles from '@/components/MoniMobileFormSafetyStyles'
import MoniMobileHeartbeatBoost from '@/components/MoniMobileHeartbeatBoost'
import MoniMobileInteractionPolish from '@/components/MoniMobileInteractionPolish'
import MoniMobileLiveWave from '@/components/MoniMobileLiveWave'
import MoniMobileManagementCenter from '@/components/MoniMobileManagementCenter'
import MoniMobileManagementCollisionStyles from '@/components/MoniMobileManagementCollisionStyles'
import MoniMobilePhotoInboundBridge from '@/components/MoniMobilePhotoInboundBridge'
import MoniMobilePhotoRawInboundEnhancer from '@/components/MoniMobilePhotoRawInboundEnhancer'
import MoniMobilePhotoTouchGuard from '@/components/MoniMobilePhotoTouchGuard'
import MoniMobileSubmittedPhotoTrayGuard from '@/components/MoniMobileSubmittedPhotoTrayGuard'
import MoniMobilePurchaseCardV2 from '@/components/MoniMobilePurchaseCardV2'
import MoniMobileRawCardRouteGuard from '@/components/MoniMobileRawCardRouteGuard'
import MoniMobileRawMaterialCardV2 from '@/components/MoniMobileRawMaterialCardV2'
import MoniMobileRuntimeGuard from '@/components/MoniMobileRuntimeGuard'
import MoniMobileSalesExportBundleCard from '@/components/MoniMobileSalesExportBundleCard'
import MoniMobileSalesStatementCard from '@/components/MoniMobileSalesStatementCard'
import MoniMobileThinkingCharacterMotion from '@/components/MoniMobileThinkingCharacterMotion'
import MoniMobileThinkingCharacterMotionPatch from '@/components/MoniMobileThinkingCharacterMotionPatch'
import MoniMobileThinkingCopyFix from '@/components/MoniMobileThinkingCopyFix'
import MoniMobileTurnBoundaryReset from '@/components/MoniMobileTurnBoundaryReset'
import MoniMobileTurnHygieneGuard from '@/components/MoniMobileTurnHygieneGuard'
import MoniMobileUxPolish from '@/components/MoniMobileUxPolish'
import MoniMobileVoiceCanvasWave from '@/components/MoniMobileVoiceCanvasWave'
import MoniMobileVoiceTouchGuard from '@/components/MoniMobileVoiceTouchGuard'
import { getSessionFromCookies } from '@/lib/allowance/session'

export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function MoniMobilePage() {
  const session = await getSessionFromCookies()
  if (!session) return <AllowanceLogin />
  if (session.role === 'freelancer') redirect('/freelancer')

  return (
    <main
      data-moni-mobile-chat
      className="fixed inset-0 z-[1000] flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[#f7fcfb] text-[#173b52]"
    >
      <MoniMobileFormSafetyStyles />
      <MoniMobileManagementCollisionStyles />
      <MoniMobileRuntimeGuard />
      <MoniMobileVoiceTouchGuard />
      <MoniMobilePhotoTouchGuard />
      <MoniMobileSubmittedPhotoTrayGuard />
      <MoniMobilePhotoInboundBridge />
      <MoniMobilePhotoRawInboundEnhancer />
      <MoniMobileAnswerActions />
      <MoniMobileDocumentSaveUX />
      <MoniMobileUxPolish />
      <MoniMobileInteractionPolish />
      <MoniMobileThinkingCopyFix />
      <MoniMobileBusyRecovery />
      <MoniMobileRawCardRouteGuard />
      <MoniMobileContinuityGuard />
      <MoniMobileExportWorkflowGuard />
      <MoniMobileHeartbeatBoost />
      <MoniMobileLiveWave />
      <MoniMobileThinkingCharacterMotion />
      <MoniMobileThinkingCharacterMotionPatch />
      <MoniMobileVoiceCanvasWave />
      <MoniMobileRawMaterialCardV2 />
      <MoniMobileBusinessCards />
      <MoniMobileSalesStatementCard />
      <MoniMobileSalesExportBundleCard />
      <MoniMobilePurchaseCardV2 />
      <MoniMobileExtendedFormCard />
      <MoniMobileCapabilityV4 />
      <MoniMobileManagementCenter />
      <MoniMobileTurnHygieneGuard />
      <MoniMobileTurnBoundaryReset />
      <MoniMobileChat />
    </main>
  )
}
