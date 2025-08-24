'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search, Package, CheckCircle, XCircle, Clock, AlertTriangle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { format } from 'date-fns'

interface TransferStatus {
  transferId: string
  status: string
  sender: string
  receiver: string
  timestamp: string
  itemType: string
  itemId: string
}

export function TransferStatusChecker() {
  const api = useApi()
  const [transferId, setTransferId] = useState('')
  const [searchId, setSearchId] = useState('')

  // Fetch transfer status
  const { data: transferStatus, isLoading, error } = useQuery({
    queryKey: ['transfer-status', searchId],
    queryFn: async () => {
      if (!api || !searchId) return null
      const { data } = await api.get<TransferStatus>(`/api/supply-chain/transfer/${searchId}/status`)
      return data
    },
    enabled: !!api && !!searchId
  })

  const handleSearch = () => {
    if (transferId.trim()) {
      setSearchId(transferId.trim())
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED':
      case 'VALIDATED':
        return <CheckCircle className="w-5 h-5 text-green-500" />
      case 'FAILED':
      case 'DISPUTED':
        return <XCircle className="w-5 h-5 text-red-500" />
      case 'PENDING':
      case 'IN_TRANSIT':
        return <Clock className="w-5 h-5 text-yellow-500" />
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status?.toUpperCase()) {
      case 'COMPLETED':
      case 'VALIDATED':
        return 'bg-green-100 text-green-800'
      case 'FAILED':
      case 'DISPUTED':
        return 'bg-red-100 text-red-800'
      case 'PENDING':
      case 'IN_TRANSIT':
        return 'bg-yellow-100 text-yellow-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-2">Check Transfer Status</h3>
        <p className="text-sm text-gray-600">Enter a transfer ID to check its current status</p>
      </div>

      {/* Search Form */}
      <div className="flex gap-2 mb-6">
        <div className="flex-1">
          <input
            type="text"
            value={transferId}
            onChange={(e) => setTransferId(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter transfer ID (e.g., MAT-TRANSFER-123456)"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={!transferId.trim() || isLoading}
          className="px-4 py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Search className="w-5 h-5" />
        </button>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-luxury-gold"></div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          <p className="text-sm">Transfer not found or you don't have access to view it.</p>
        </div>
      )}

      {/* Transfer Status Display */}
      {transferStatus && !isLoading && (
        <div className="border rounded-lg p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <Package className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <h4 className="font-medium text-gray-900">Transfer {transferStatus.transferId}</h4>
                <p className="text-sm text-gray-600 capitalize">{transferStatus.itemType} Transfer</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {getStatusIcon(transferStatus.status)}
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(transferStatus.status)}`}>
                {transferStatus.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-500">From</p>
              <p className="font-medium">{transferStatus.sender}</p>
            </div>
            <div>
              <p className="text-gray-500">To</p>
              <p className="font-medium">{transferStatus.receiver}</p>
            </div>
            <div>
              <p className="text-gray-500">Item ID</p>
              <p className="font-medium">{transferStatus.itemId}</p>
            </div>
            <div>
              <p className="text-gray-500">Timestamp</p>
              <p className="font-medium">
                {format(new Date(transferStatus.timestamp), 'MMM dd, yyyy HH:mm')}
              </p>
            </div>
          </div>

          {/* Status Timeline */}
          <div className="mt-6 pt-6 border-t">
            <h5 className="text-sm font-medium text-gray-700 mb-3">Transfer Timeline</h5>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm text-gray-600">Transfer initiated by {transferStatus.sender}</span>
              </div>
              {transferStatus.status === 'PENDING' && (
                <div className="flex items-center gap-3">
                  <Clock className="w-4 h-4 text-yellow-500" />
                  <span className="text-sm text-gray-600">Awaiting confirmation from {transferStatus.receiver}</span>
                </div>
              )}
              {transferStatus.status === 'VALIDATED' && (
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span className="text-sm text-gray-600">Transfer completed and validated</span>
                </div>
              )}
              {transferStatus.status === 'DISPUTED' && (
                <div className="flex items-center gap-3">
                  <XCircle className="w-4 h-4 text-red-500" />
                  <span className="text-sm text-gray-600">Transfer is under dispute</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* No Results */}
      {searchId && !transferStatus && !isLoading && !error && (
        <div className="text-center py-8 text-gray-500">
          <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No transfer found with ID: {searchId}</p>
        </div>
      )}
    </div>
  )
}