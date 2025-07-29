'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Package, TrendingUp, FileText, AlertCircle, LogOut } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/auth-store'

export function B2BNavigation() {
  const pathname = usePathname()
  const { user, logout } = useAuthStore()

  const navItems = [
    {
      label: 'Dashboard',
      href: '/b2b',
      icon: Package,
    },
    {
      label: 'Transactions',
      href: '/b2b/transactions',
      icon: FileText,
    },
    {
      label: 'Trust Network',
      href: '/b2b/trust',
      icon: TrendingUp,
    },
    {
      label: 'Disputes',
      href: '/b2b/disputes',
      icon: AlertCircle,
    },
  ]

  return (
    <nav className="fixed top-0 left-0 right-0 bg-white shadow-md z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-8">
            <Link href="/b2b" className="flex items-center space-x-2">
              <Package className="w-8 h-8 text-luxury-gold" />
              <span className="font-semibold text-xl">B2B Portal</span>
            </Link>

            <div className="hidden md:flex space-x-4">
              {navItems.map((item) => {
                const Icon = item.icon
                const isActive = pathname === item.href
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-luxury-gold text-luxury-black'
                        : 'text-gray-600 hover:bg-gray-100'
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600">
              {user?.organization || 'Partner'}
            </div>
            <button
              onClick={logout}
              className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Logout</span>
            </button>
          </div>
        </div>
      </div>
    </nav>
  )
}