'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { 
  Activity, 
  Server, 
  Database, 
  Cpu, 
  HardDrive, 
  Users, 
  TrendingUp, 
  TrendingDown,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  Zap,
  Shield,
  Globe,
  RefreshCw
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'

interface SystemMetrics {
  blockchain: {
    status: 'healthy' | 'degraded' | 'down'
    blockHeight: number
    transactionCount: number
    peerCount: number
    latestBlock: string
    averageBlockTime: number
  }
  database: {
    status: 'healthy' | 'degraded' | 'down'
    connections: number
    maxConnections: number
    queryTime: number
    size: string
  }
  api: {
    status: 'healthy' | 'degraded' | 'down'
    uptime: number
    requestsPerMinute: number
    errorRate: number
    averageResponseTime: number
  }
  consensus: {
    pendingTransactions: number
    validatedToday: number
    disputeRate: number
    averageConfirmationTime: number
  }
}

interface NetworkHealth {
  organizations: {
    name: string
    status: 'online' | 'offline' | 'degraded'
    lastSeen: string
    transactionsToday: number
    errorRate: number
  }[]
  recentEvents: {
    id: string
    type: 'info' | 'warning' | 'error'
    message: string
    timestamp: string
    organization?: string
  }[]
}

export function SystemMonitoring() {
  const api = useApi()
  const [autoRefresh, setAutoRefresh] = useState(true)

  // Fetch system metrics - REAL DATA
  const { data: metrics, isLoading: metricsLoading, refetch: refetchMetrics } = useQuery({
    queryKey: ['system-metrics'],
    queryFn: async () => {
      if (!api) return null
      const { data } = await api.get<SystemMetrics>('/api/admin/metrics')
      return data
    },
    enabled: !!api,
    refetchInterval: autoRefresh ? 10000 : false
  })

  // Fetch network health - REAL DATA
  const { data: health, isLoading: healthLoading, refetch: refetchHealth } = useQuery({
    queryKey: ['network-health'],
    queryFn: async () => {
      if (!api) return null
      const { data } = await api.get<NetworkHealth>('/api/admin/health')
      return data
    },
    enabled: !!api,
    refetchInterval: autoRefresh ? 10000 : false
  })

  const handleManualRefresh = () => {
    refetchMetrics()
    refetchHealth()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'online':
        return 'text-green-600 bg-green-100'
      case 'degraded':
        return 'text-yellow-600 bg-yellow-100'
      case 'down':
      case 'offline':
        return 'text-red-600 bg-red-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'warning':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />
      default:
        return <CheckCircle className="w-4 h-4 text-blue-500" />
    }
  }

  if (metricsLoading || healthLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold"></div>
      </div>
    )
  }

  // Use REAL data from backend, no mocks!
  if (!metrics || !health) {
    // Default empty state while loading
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold"></div>
      </div>
    )
  }

  const currentMetrics = metrics
  const currentHealth = health

  return (
    <div className="space-y-6">
      {/* Header with Refresh Controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">System Monitoring</h2>
          <p className="text-gray-600">Real-time system health and performance metrics</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-gray-300 text-luxury-gold focus:ring-luxury-gold"
            />
            <span className="text-sm text-gray-700">Auto-refresh</span>
          </label>
          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* System Components Status */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Blockchain Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Blockchain</h3>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(currentMetrics.blockchain.status)}`}>
              {currentMetrics.blockchain.status}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Block Height</span>
              <span className="font-medium">{currentMetrics.blockchain.blockHeight.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Transactions</span>
              <span className="font-medium">{currentMetrics.blockchain.transactionCount.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Peers</span>
              <span className="font-medium">{currentMetrics.blockchain.peerCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Block Time</span>
              <span className="font-medium">{currentMetrics.blockchain.averageBlockTime}s</span>
            </div>
          </div>
        </div>

        {/* Database Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Database className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Database</h3>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(currentMetrics.database.status)}`}>
              {currentMetrics.database.status}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Connections</span>
              <span className="font-medium">{currentMetrics.database.connections}/{currentMetrics.database.maxConnections}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Query Time</span>
              <span className="font-medium">{currentMetrics.database.queryTime}ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Size</span>
              <span className="font-medium">{currentMetrics.database.size}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Load</span>
              <span className="font-medium">{Math.round((currentMetrics.database.connections / currentMetrics.database.maxConnections) * 100)}%</span>
            </div>
          </div>
        </div>

        {/* API Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">API Gateway</h3>
            </div>
            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(currentMetrics.api.status)}`}>
              {currentMetrics.api.status}
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Uptime</span>
              <span className="font-medium">{currentMetrics.api.uptime}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Requests/min</span>
              <span className="font-medium">{currentMetrics.api.requestsPerMinute}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Error Rate</span>
              <span className="font-medium">{currentMetrics.api.errorRate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Response Time</span>
              <span className="font-medium">{currentMetrics.api.averageResponseTime}ms</span>
            </div>
          </div>
        </div>

        {/* Consensus Status */}
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">2-Check Consensus</h3>
            </div>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-600">
              active
            </span>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Pending</span>
              <span className="font-medium">{currentMetrics.consensus.pendingTransactions}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Validated Today</span>
              <span className="font-medium">{currentMetrics.consensus.validatedToday}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Dispute Rate</span>
              <span className="font-medium">{currentMetrics.consensus.disputeRate}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Avg Confirm</span>
              <span className="font-medium">{currentMetrics.consensus.averageConfirmationTime}s</span>
            </div>
          </div>
        </div>
      </div>

      {/* Organization Status */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Network Organizations</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Organization
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Last Seen
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Transactions Today
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Error Rate
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {currentHealth.organizations.map((org) => (
                <tr key={org.name} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <Server className="w-4 h-4 text-gray-400 mr-2" />
                      <span className="text-sm font-medium text-gray-900">{org.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(org.status)}`}>
                      {org.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {format(new Date(org.lastSeen), 'HH:mm:ss')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm text-gray-900">
                      <BarChart3 className="w-4 h-4 text-gray-400 mr-2" />
                      {org.transactionsToday}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center text-sm">
                      {org.errorRate > 1 ? (
                        <>
                          <TrendingUp className="w-4 h-4 text-red-500 mr-1" />
                          <span className="text-red-600">{org.errorRate}%</span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="w-4 h-4 text-green-500 mr-1" />
                          <span className="text-green-600">{org.errorRate}%</span>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Events */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Recent System Events</h3>
        </div>
        <div className="divide-y divide-gray-200 max-h-64 overflow-y-auto">
          {currentHealth.recentEvents.map((event) => (
            <div key={event.id} className="px-6 py-3 hover:bg-gray-50">
              <div className="flex items-start gap-3">
                {getEventIcon(event.type)}
                <div className="flex-1">
                  <p className="text-sm text-gray-900">{event.message}</p>
                  <div className="flex items-center gap-4 mt-1">
                    <span className="text-xs text-gray-500">
                      {format(new Date(event.timestamp), 'MMM dd, HH:mm:ss')}
                    </span>
                    {event.organization && (
                      <span className="text-xs text-gray-500">
                        Organization: {event.organization}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Performance Metrics Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-r from-green-50 to-green-100 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-green-900">System Health Score</h4>
            <Activity className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-3xl font-bold text-green-900">
            {currentMetrics.blockchain.status === 'healthy' && currentMetrics.database.status === 'healthy' 
              ? '100%' 
              : currentMetrics.blockchain.status === 'degraded' || currentMetrics.database.status === 'degraded'
              ? '75%'
              : '50%'}
          </div>
          <p className="text-sm text-green-700 mt-1">
            {currentMetrics.blockchain.status === 'healthy' ? 'All systems operational' : 'Some systems degraded'}
          </p>
        </div>

        <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-blue-900">Transaction Success Rate</h4>
            <CheckCircle className="w-5 h-5 text-blue-600" />
          </div>
          <div className="text-3xl font-bold text-blue-900">
            {currentMetrics.consensus.disputeRate 
              ? `${(100 - parseFloat(currentMetrics.consensus.disputeRate.toString())).toFixed(1)}%`
              : '100%'}
          </div>
          <p className="text-sm text-blue-700 mt-1">Based on dispute rate</p>
        </div>

        <div className="bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg p-6">
          <div className="flex items-center justify-between mb-2">
            <h4 className="font-medium text-purple-900">Average Response Time</h4>
            <Clock className="w-5 h-5 text-purple-600" />
          </div>
          <div className="text-3xl font-bold text-purple-900">
            {currentMetrics.api.averageResponseTime || currentMetrics.database.queryTime}ms
          </div>
          <p className="text-sm text-purple-700 mt-1">
            {currentMetrics.api.averageResponseTime < 200 ? 'Below target threshold' : 'Monitor performance'}
          </p>
        </div>
      </div>
    </div>
  )
}