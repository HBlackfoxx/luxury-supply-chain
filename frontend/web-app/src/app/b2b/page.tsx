'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PendingActions } from '@/components/b2b/pending-actions'
import { TrustScoreDashboard } from '@/components/b2b/trust-score-dashboard'
import { TransactionHistory } from '@/components/b2b/transaction-history'
import { BatchOperations } from '@/components/b2b/batch-operations'
import { AnomalyAlerts } from '@/components/b2b/anomaly-alerts'
import { PerformanceCharts } from '@/components/b2b/performance-charts'
import { EmergencyBanner } from '@/components/b2b/emergency-banner'
import { Header } from '@/components/layout/header'
import { useAuthStore } from '@/stores/auth-store'
import { Package, TrendingUp, History, Layers, BarChart3 } from 'lucide-react'

export default function B2BDashboard() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()
  const [activeTab, setActiveTab] = useState('pending')

  useEffect(() => {
    if (!isAuthenticated || !user) {
      router.push('/login')
    }
  }, [isAuthenticated, user, router])

  // These would be fetched from API in production
  const stats = [
    {
      label: 'Pending Actions',
      value: '0', // Will be updated by actual API calls
      icon: Package,
      color: 'text-orange-600',
      bg: 'bg-orange-100',
    },
    {
      label: 'Trust Score',
      value: '--%',
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      label: 'This Month',
      value: '0',
      icon: History,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      label: 'Active Batches',
      value: '0',
      icon: Layers,
      color: 'text-purple-600',
      bg: 'bg-purple-100',
    },
  ]

  if (!user) return null

  return (
    <>
      <Header />
      <EmergencyBanner />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">B2B Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Welcome back, {user?.organization || 'Partner'}
        </p>
      </div>

      {/* Anomaly Alerts */}
      <AnomalyAlerts />

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`p-3 ${stat.bg} rounded-lg`}>
                  <Icon className={`w-6 h-6 ${stat.color}`} />
                </div>
                <span className="text-2xl font-bold text-gray-900">
                  {stat.value}
                </span>
              </div>
              <p className="text-sm text-gray-600">{stat.label}</p>
            </div>
          )
        })}
      </div>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="pending">Pending Actions</TabsTrigger>
          <TabsTrigger value="trust">Trust Scores</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="batch">Batch Operations</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          <PendingActions />
        </TabsContent>

        <TabsContent value="trust" className="space-y-4">
          <TrustScoreDashboard />
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <TransactionHistory />
        </TabsContent>

        <TabsContent value="batch" className="space-y-4">
          <BatchOperations />
        </TabsContent>

        <TabsContent value="analytics" className="space-y-4">
          <PerformanceCharts />
        </TabsContent>
      </Tabs>
    </div>
    </>
  )
}