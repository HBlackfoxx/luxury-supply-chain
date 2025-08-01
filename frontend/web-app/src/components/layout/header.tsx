'use client'

import { useAuthStore } from '@/stores/auth-store'
import { LogOut, User } from 'lucide-react'
import Link from 'next/link'

export function Header() {
  const { user, logout } = useAuthStore()

  if (!user) return null

  const getRoleDisplay = (role: string) => {
    switch (role) {
      case 'brand': return 'Brand Administrator'
      case 'supplier': return 'Supplier'
      case 'manufacturer': return 'Manufacturer'
      case 'retailer': return 'Retailer'
      default: return role
    }
  }

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="font-serif text-xl text-luxury-black">
              LuxeBags
            </Link>
            <span className="ml-4 text-sm text-gray-500">
              Supply Chain Management
            </span>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2 text-sm">
              <div className="p-1.5 bg-gray-100 rounded-lg">
                <User className="w-4 h-4 text-gray-600" />
              </div>
              <div>
                <p className="font-medium text-gray-900">{user.name}</p>
                <p className="text-xs text-gray-500">{getRoleDisplay(user.role)}</p>
              </div>
            </div>

            <button
              onClick={logout}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm text-gray-700 hover:text-gray-900 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}