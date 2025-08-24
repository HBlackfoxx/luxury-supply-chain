'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
// import { CompensationManagement } from '@/components/admin/compensation-management' // Not in scope
// import { EmergencyStopControl } from '@/components/admin/emergency-stop-control' // Not in scope
import { UserManagement } from '@/components/admin/user-management'
import { SystemMonitoring } from '@/components/admin/system-monitoring'
import { AuditLogViewer } from '@/components/b2b/audit-log-viewer'
import { Header } from '@/components/layout/header'
import { useAuthStore } from '@/stores/auth-store'
import { useApi } from '@/hooks/use-api'
import { Shield, AlertTriangle, Users, Activity, FileText, DollarSign } from 'lucide-react'

export default function AdminDashboard() {
  const router = useRouter()
  const { user, isAuthenticated } = useAuthStore()
  const api = useApi()
  const [activeTab, setActiveTab] = useState('monitoring')

  useEffect(() => {
    // Redirect if not authenticated or not admin
    if (!isAuthenticated || !user) {
      router.push('/login')
    } else if (user.role !== 'admin') {
      // Non-admins go to B2B dashboard
      router.push('/b2b')
    }
  }, [isAuthenticated, user, router])

  if (!user || user.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <Shield className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Admin Access Required</h2>
          <p className="text-gray-600">You need administrator privileges to access this page.</p>
        </div>
      </div>
    )
  }

  // Fetch real admin statistics
  const { data: adminStats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      if (!api) return null
      
      // Fetch real data from multiple endpoints
      const [metricsRes, disputesRes, compensationsRes] = await Promise.all([
        api.get('/api/admin/metrics').catch(() => ({ data: null })),
        api.get('/api/consensus/disputes/open/' + user?.organization).catch(() => ({ data: [] })),
        api.get('/api/consensus/compensation/pending').catch(() => ({ data: [] }))
      ])
      
      const metrics = metricsRes.data
      const disputes = Array.isArray(disputesRes.data) ? disputesRes.data : []
      const compensations = Array.isArray(compensationsRes.data) ? compensationsRes.data : []
      
      return {
        activeUsers: metrics?.database?.connections || 0,
        systemStatus: metrics?.blockchain?.status || 'unknown',
        pendingCompensations: compensations.length,
        activeDisputes: disputes.filter((d: any) => d.status === 'OPEN' || d.status === 'INVESTIGATING').length
      }
    },
    enabled: !!api && !!user
  })

  const stats = [
    {
      label: 'Active Users',
      value: adminStats?.activeUsers?.toString() || '0',
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-100',
    },
    {
      label: 'System Status',
      value: adminStats?.systemStatus === 'healthy' ? 'Healthy' : adminStats?.systemStatus || 'Unknown',
      icon: Activity,
      color: adminStats?.systemStatus === 'healthy' ? 'text-green-600' : 'text-yellow-600',
      bg: adminStats?.systemStatus === 'healthy' ? 'bg-green-100' : 'bg-yellow-100',
    },
    {
      label: 'Pending Compensations',
      value: adminStats?.pendingCompensations?.toString() || '0',
      icon: DollarSign,
      color: 'text-yellow-600',
      bg: 'bg-yellow-100',
    },
    {
      label: 'Active Disputes',
      value: adminStats?.activeDisputes?.toString() || '0',
      icon: AlertTriangle,
      color: 'text-red-600',
      bg: 'bg-red-100',
    },
  ]

  return (
    <>
      <Header />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-8 h-8 text-luxury-gold" />
            <h1 className="text-3xl font-bold text-gray-900">Admin Dashboard</h1>
          </div>
          <p className="text-gray-600">
            System administration and monitoring for {user?.organization || 'Organization'}
          </p>
        </div>

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
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="monitoring">System Monitoring</TabsTrigger>
            {/* <TabsTrigger value="emergency">Emergency Control</TabsTrigger> Not in scope */}
            {/* <TabsTrigger value="compensation">Compensations</TabsTrigger> Not in scope */}
            <TabsTrigger value="users">User Management</TabsTrigger>
            <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="monitoring" className="space-y-4">
            <SystemMonitoring />
          </TabsContent>

          {/* <TabsContent value="emergency" className="space-y-4">
            <EmergencyStopControl />
          </TabsContent> Not in scope */}

          {/* <TabsContent value="compensation" className="space-y-4">
            <CompensationManagement />
          </TabsContent> Not in scope */}

          <TabsContent value="users" className="space-y-4">
            <UserManagement />
          </TabsContent>

          <TabsContent value="audit" className="space-y-4">
            <AuditLogViewer />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
}