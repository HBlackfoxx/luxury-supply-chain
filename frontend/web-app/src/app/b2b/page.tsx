'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PendingActions } from '@/components/b2b/pending-actions'
import { TrustScoreDashboard } from '@/components/b2b/trust-score-dashboard'
import { TransactionHistory } from '@/components/b2b/transaction-history'
import { BatchOperations } from '@/components/b2b/batch-operations'
// import { AnomalyAlerts } from '@/components/b2b/anomaly-alerts' // Not in scope
import { PerformanceCharts } from '@/components/b2b/performance-charts'
// import { EmergencyBanner } from '@/components/b2b/emergency-banner' // Not in scope
import { ProductManagement } from '@/components/b2b/product-management'
import { AuditLogViewer } from '@/components/b2b/audit-log-viewer'
import { DisputeManagement } from '@/components/b2b/dispute-management'
import { DashboardStats } from '@/components/b2b/dashboard-stats'
import { TransferStatusChecker } from '@/components/b2b/transfer-status'
import { Header } from '@/components/layout/header'
import { useAuthStore } from '@/stores/auth-store'
import { useApi } from '@/hooks/use-api'
import { Package, TrendingUp, History, Layers, BarChart3, AlertTriangle } from 'lucide-react'

export default function B2BDashboard() {
  const router = useRouter()
  const { user, isAuthenticated, hasHydrated } = useAuthStore()
  const [activeTab, setActiveTab] = useState('dashboard')

  const api = useApi()

  useEffect(() => {
    // Only redirect after the auth store has hydrated from localStorage
    if (hasHydrated && !isAuthenticated) {
      router.push('/login')
    }
  }, [hasHydrated, isAuthenticated, router])

  // Fetch REAL stats from APIs
  const { data: statsData } = useQuery({
    queryKey: ['dashboard-stats', user?.organization],
    queryFn: async () => {
      if (!api || !user) return null
      
      // Fetch all data sources in parallel
      const [pendingRes, txHistoryRes, disputesRes] = await Promise.all([
        api.get('/api/supply-chain/transfers/pending').catch(() => ({ data: [] })),
        api.get('/api/supply-chain/transactions/history').catch(() => ({ data: [] })),
        api.get('/api/consensus/disputes').catch(() => ({ data: [] }))
      ])
      
      // Calculate trust score from transaction history
      const transactions = Array.isArray(txHistoryRes.data) ? txHistoryRes.data : []
      const partners = new Set()
      let totalScore = 0
      let partnerCount = 0
      
      transactions.forEach((tx: any) => {
        const partner = tx.sender === user.organization ? tx.receiver : tx.sender
        if (!partners.has(partner) && partner !== user.organization) {
          partners.add(partner)
          partnerCount++
          // Calculate trust based on transaction outcomes
          if (tx.state === 'VALIDATED') totalScore += 95
          else if (tx.state === 'DISPUTED') totalScore += 60
          else if (tx.state === 'SENT' || tx.state === 'RECEIVED') totalScore += 85
          else totalScore += 75
        }
      })
      
      const trustScore = partnerCount > 0 ? Math.round(totalScore / partnerCount) : 85
      
      // Count this month's transactions
      const now = new Date()
      const thisMonth = transactions.filter((tx: any) => {
        const txDate = new Date(tx.createdAt || tx.created || tx.updatedAt)
        return txDate.getMonth() === now.getMonth() && txDate.getFullYear() === now.getFullYear()
      }).length
      
      // Count active disputes
      const disputes = Array.isArray(disputesRes.data) ? disputesRes.data.filter((d: any) => 
        d.status === 'OPEN' || d.status === 'INVESTIGATING'
      ).length : 0
      
      // Count pending transfers
      const pendingTransfers = Array.isArray(pendingRes.data) ? pendingRes.data : []
      
      return {
        pending: pendingTransfers.length,
        trustScore,
        thisMonth,
        disputes
      }
    },
    enabled: !!api && !!user,
    refetchInterval: 30000 // Refresh every 30 seconds
  })

  const stats = [
    {
      label: 'Pending Actions',
      value: statsData?.pending?.toString() || '0',
      icon: Package,
      color: 'text-orange-600',
      bg: 'bg-orange-100',
    },
    {
      label: 'Trust Score',
      value: statsData?.trustScore ? `${statsData.trustScore}%` : '85%',
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-100',
    },
    {
      label: 'This Month',
      value: statsData?.thisMonth?.toString() || '0',
      icon: History,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      label: 'Active Disputes',
      value: statsData?.disputes?.toString() || '0',
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-100',
    },
  ]

  // Show loading while auth store is hydrating from localStorage
  if (!hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    )
  }

  // If not authenticated after hydration, will redirect via useEffect
  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold mx-auto"></div>
          <p className="mt-4 text-gray-600">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <Header />
      {/* <EmergencyBanner /> Not in scope */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">B2B Dashboard</h1>
        <p className="text-gray-600 mt-1">
          Welcome back, {user?.organization || 'Partner'}
        </p>
      </div>

      {/* Anomaly Alerts - Not in scope
      <AnomalyAlerts /> */}

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
        <TabsList className="grid w-full grid-cols-10">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="transfers">Transfers</TabsTrigger>
          <TabsTrigger value="disputes">Disputes</TabsTrigger>
          <TabsTrigger value="trust">Trust</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="batch">Batch</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="space-y-4">
          <DashboardStats />
        </TabsContent>

        <TabsContent value="pending" className="space-y-4">
          <PendingActions />
        </TabsContent>

        <TabsContent value="products" className="space-y-4">
          <ProductManagement />
        </TabsContent>

        <TabsContent value="transfers" className="space-y-4">
          <TransferStatusChecker />
          <PendingActions />
        </TabsContent>

        <TabsContent value="disputes" className="space-y-4">
          <DisputeManagement />
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

        <TabsContent value="audit" className="space-y-4">
          <AuditLogViewer />
        </TabsContent>
      </Tabs>
    </div>
    </>
  )
}