'use client'

import React, { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Activity, User, Calendar, Filter, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/stores/auth-store'

interface AuditLog {
  id: number
  user_id: string
  user_name: string
  user_email: string
  user_organization: string
  action: string
  entity_type: string
  entity_id: string
  details: any
  ip_address: string
  created_at: string
}

export function AuditLogViewer() {
  const api = useApi()
  const { user } = useAuthStore()
  const [filters, setFilters] = useState({
    action: '',
    entityType: '',
    userId: '',
    startDate: '',
    endDate: '',
    searchTerm: ''
  })
  const [currentPage, setCurrentPage] = useState(1)
  const limit = 50

  // Fetch audit logs
  const { data: logsData, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', filters, currentPage],
    queryFn: async () => {
      if (!api) return null
      
      const params = new URLSearchParams()
      if (filters.action) params.append('action', filters.action)
      if (filters.entityType) params.append('entityType', filters.entityType)
      if (filters.userId) params.append('userId', filters.userId)
      if (filters.startDate) params.append('startDate', filters.startDate)
      if (filters.endDate) params.append('endDate', filters.endDate)
      params.append('limit', limit.toString())
      params.append('offset', ((currentPage - 1) * limit).toString())
      
      const { data } = await api.get(`/api/audit/logs?${params.toString()}`)
      return data
    },
    enabled: !!api
  })

  // Fetch audit statistics
  const { data: stats } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: async () => {
      if (!api) return null
      const { data } = await api.get('/api/audit/stats?days=7')
      return data
    },
    enabled: !!api
  })

  const handleExport = async () => {
    if (!api) return
    
    // Generate CSV report of current view
    const params = new URLSearchParams()
    if (filters.action) params.append('action', filters.action)
    if (filters.entityType) params.append('entityType', filters.entityType)
    if (filters.userId) params.append('userId', filters.userId)
    if (filters.startDate) params.append('startDate', filters.startDate)
    if (filters.endDate) params.append('endDate', filters.endDate)
    params.append('limit', '1000')
    
    const { data } = await api.get(`/api/audit/logs?${params.toString()}`)
    
    // Convert to CSV
    const csv = [
      ['Timestamp', 'User', 'Organization', 'Action', 'Entity Type', 'Entity ID', 'IP Address'],
      ...data.logs.map((log: AuditLog) => [
        format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
        log.user_name || log.user_id,
        log.user_organization,
        log.action,
        log.entity_type || '',
        log.entity_id || '',
        log.ip_address || ''
      ])
    ].map(row => row.join(',')).join('\n')
    
    // Download
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `audit-log-${format(new Date(), 'yyyy-MM-dd')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const getActionColor = (action: string) => {
    switch (action.toLowerCase()) {
      case 'create':
      case 'insert':
        return 'text-green-600 bg-green-100'
      case 'update':
      case 'edit':
        return 'text-blue-600 bg-blue-100'
      case 'delete':
      case 'remove':
        return 'text-red-600 bg-red-100'
      case 'login':
      case 'logout':
        return 'text-purple-600 bg-purple-100'
      default:
        return 'text-gray-600 bg-gray-100'
    }
  }

  const filteredLogs = logsData?.logs?.filter((log: AuditLog) => {
    if (filters.searchTerm) {
      const search = filters.searchTerm.toLowerCase()
      return (
        log.user_name?.toLowerCase().includes(search) ||
        log.user_email?.toLowerCase().includes(search) ||
        log.action?.toLowerCase().includes(search) ||
        log.entity_type?.toLowerCase().includes(search) ||
        log.entity_id?.toLowerCase().includes(search)
      )
    }
    return true
  })

  const totalPages = logsData?.pagination?.pages || 1

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Audit Log</h2>
          <p className="text-gray-600">Track all system activities and changes</p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
        >
          <Download className="w-4 h-4" />
          Export CSV
        </button>
      </div>

      {/* Statistics */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Actions (7d)</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.actions.reduce((sum: number, a: any) => sum + parseInt(a.count), 0)}
                </p>
              </div>
              <Activity className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active Users (7d)</p>
                <p className="text-2xl font-bold text-gray-900">{stats.topUsers.length}</p>
              </div>
              <User className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Most Common Action</p>
                <p className="text-lg font-bold text-gray-900">
                  {stats.actions[0]?.action || 'N/A'}
                </p>
              </div>
              <Activity className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Today's Activity</p>
                <p className="text-2xl font-bold text-gray-900">
                  {stats.dailyActivity[0]?.count || 0}
                </p>
              </div>
              <Calendar className="w-8 h-8 text-gray-400" />
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-700">Filters:</span>
          </div>
          
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search logs..."
              value={filters.searchTerm}
              onChange={(e) => setFilters({ ...filters, searchTerm: e.target.value })}
              className="pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
            />
          </div>
          
          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-luxury-gold focus:border-luxury-gold"
          >
            <option value="">All Actions</option>
            <option value="LOGIN">Login</option>
            <option value="LOGOUT">Logout</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="APPROVE">Approve</option>
            <option value="REJECT">Reject</option>
          </select>
          
          <select
            value={filters.entityType}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-luxury-gold focus:border-luxury-gold"
          >
            <option value="">All Entities</option>
            <option value="transaction">Transactions</option>
            <option value="product">Products</option>
            <option value="material">Materials</option>
            <option value="user">Users</option>
            <option value="dispute">Disputes</option>
          </select>
          
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-luxury-gold focus:border-luxury-gold"
            placeholder="Start Date"
          />
          
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
            className="text-sm border border-gray-300 rounded-md px-3 py-1.5 focus:ring-luxury-gold focus:border-luxury-gold"
            placeholder="End Date"
          />
          
          <button
            onClick={() => {
              setFilters({
                action: '',
                entityType: '',
                userId: '',
                startDate: '',
                endDate: '',
                searchTerm: ''
              })
              setCurrentPage(1)
            }}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Entity
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  IP Address
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredLogs?.map((log: AuditLog) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {format(new Date(log.created_at), 'MMM dd, yyyy HH:mm:ss')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">{log.user_name || log.user_id}</div>
                      <div className="text-gray-500">{log.user_organization}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(log.action)}`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {log.entity_type && (
                      <div>
                        <div className="font-medium">{log.entity_type}</div>
                        {log.entity_id && (
                          <div className="text-gray-500 text-xs">{log.entity_id.substring(0, 8)}...</div>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">
                    {log.details && (
                      <span title={JSON.stringify(log.details)}>
                        {typeof log.details === 'object' 
                          ? JSON.stringify(log.details).substring(0, 50) + '...'
                          : log.details}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {log.ip_address || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className="bg-gray-50 px-6 py-3 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {((currentPage - 1) * limit) + 1} to {Math.min(currentPage * limit, logsData?.pagination?.total || 0)} of {logsData?.pagination?.total || 0} entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              disabled={currentPage === 1}
              className="p-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
              disabled={currentPage === totalPages}
              className="p-2 text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}