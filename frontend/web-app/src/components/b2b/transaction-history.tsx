'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { format } from 'date-fns'
import { Package, CheckCircle, XCircle, Clock, Filter, Download } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/stores/auth-store'

interface Transaction {
  id: string
  type: 'SENT' | 'RECEIVED'
  itemId: string
  itemDescription: string
  partner: string
  value: number
  status: 'VALIDATED' | 'PENDING_RECEIVER' | 'PENDING_SENDER' | 'DISPUTED' | 'TIMEOUT'
  createdAt: string
  confirmedAt?: string
  confirmationTime?: number
}

export function TransactionHistory() {
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const api = useApi()
  const { user } = useAuthStore()

  const { data: transactions, isLoading } = useQuery({
    queryKey: ['transaction-history', filter, statusFilter, user?.organization],
    queryFn: async () => {
      if (!api || !user?.organization) return []
      const params = new URLSearchParams()
      if (filter !== 'all') params.append('type', filter)
      if (statusFilter !== 'all') params.append('status', statusFilter)
      params.append('limit', '50')
      
      // Query directly from blockchain through supply chain API
      const { data } = await api.get<Transaction[]>(`/api/supply-chain/transactions/history?${params}`)
      return data
    },
    enabled: !!api && !!user?.organization,
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'VALIDATED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Validated
          </span>
        )
      case 'DISPUTED':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Disputed
          </span>
        )
      case 'TIMEOUT':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <Clock className="w-3 h-3 mr-1" />
            Timeout
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <Clock className="w-3 h-3 mr-1" />
            Pending
          </span>
        )
    }
  }

  const exportTransactions = () => {
    if (!transactions || transactions.length === 0) {
      alert('No transactions to export')
      return
    }

    // Create CSV content
    const headers = ['Transaction ID', 'Type', 'Item', 'Partner', 'Value', 'Status', 'Created Date', 'Validated Date']
    const rows = transactions.map(tx => [
      tx.id,
      tx.type,
      tx.itemDescription,
      tx.partner,
      tx.value.toString(),
      tx.status,
      format(new Date(tx.createdAt), 'yyyy-MM-dd HH:mm:ss'),
      (tx as any).validatedAt ? format(new Date((tx as any).validatedAt), 'yyyy-MM-dd HH:mm:ss') : ''
    ])

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n')

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold"></div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Transaction History</h2>
          
          <div className="flex items-center space-x-4">
            {/* Type Filter */}
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="text-sm border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
            >
              <option value="all">All Types</option>
              <option value="sent">Sent</option>
              <option value="received">Received</option>
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
            >
              <option value="all">All Status</option>
              <option value="VALIDATED">Validated</option>
              <option value="PENDING_SENDER">Pending Sender</option>
              <option value="PENDING_RECEIVER">Pending Receiver</option>
              <option value="DISPUTED">Disputed</option>
              <option value="TIMEOUT">Timeout</option>
            </select>

            <button
              onClick={exportTransactions}
              className="flex items-center space-x-1 px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Transaction
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Partner
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Value
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {transactions?.map((transaction) => (
              <tr key={transaction.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className={`p-2 rounded-lg mr-3 ${
                      transaction.type === 'SENT' ? 'bg-blue-100' : 'bg-green-100'
                    }`}>
                      <Package className={`w-4 h-4 ${
                        transaction.type === 'SENT' ? 'text-blue-600' : 'text-green-600'
                      }`} />
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {transaction.itemDescription}
                      </div>
                      <div className="text-xs text-gray-500">{transaction.id}</div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  {transaction.partner}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                  ${transaction.value.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(transaction.status)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {format(new Date(transaction.createdAt), 'MMM dd, yyyy')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {(!transactions || transactions.length === 0) && (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No transactions found</p>
            <p className="text-sm text-gray-500 mt-1">Adjust your filters or check back later</p>
          </div>
        )}
      </div>
    </div>
  )
}