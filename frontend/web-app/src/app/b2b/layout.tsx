import { B2BNavigation } from '@/components/b2b/navigation'

export default function B2BLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      <B2BNavigation />
      <main className="pt-16">
        {children}
      </main>
    </div>
  )
}