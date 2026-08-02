import AdminChromeRecoveryController from '@/components/AdminChromeRecoveryController'

export default function RootTemplate({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminChromeRecoveryController />
      {children}
    </>
  )
}
