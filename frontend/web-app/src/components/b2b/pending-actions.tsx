'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, Package, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { DisputeModal } from './dispute-modal'

interface PendingTransaction {
  id: string
  type: 'SENT' | 'RECEIVED'
  itemId: string
  itemDescription: string
  partner: string
  createdAt: string
  value: number
  status: 'PENDING_CONFIRMATION'
}

export function PendingActions() {
  const queryClient = useQueryClient()
  const [selectedDispute, setSelectedDispute] = useState<PendingTransaction | null>(null)

  // Fetch pending transactions
  const { data: pendingTransactions, isLoading } = useQuery({
    queryKey: ['pending-transactions'],
    queryFn: async () => {
      // Get user's org ID (in production, from auth token)
      const orgId = 'luxebags' // This should come from auth
      const { data } = await axios.get<PendingTransaction[]>(`/api/consensus/transactions/pending/${orgId}`)
      return data
    },
  })

  // Confirm sent mutation
  const confirmSentMutation = useMutation({
    mutationFn: async ({ txId, evidence }: { txId: string; evidence: any }) => {
      const { data } = await axios.post(`/api/consensus/transactions/${txId}/confirm-sent`, {
        evidence,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] })
    },
  })

  // Confirm received mutation
  const confirmReceivedMutation = useMutation({
    mutationFn: async ({ txId, evidence }: { txId: string; evidence: any }) => {
      const { data } = await axios.post(`/api/consensus/transactions/${txId}/confirm-received`, {
        evidence,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] })
    },
  })

  const handleConfirm = (transaction: PendingTransaction) => {
    const evidence = {
      timestamp: new Date().toISOString(),
      notes: 'Confirmed via web portal',
    }

    if (transaction.type === 'SENT') {
      confirmSentMutation.mutate({ txId: transaction.id, evidence })
    } else {
      confirmReceivedMutation.mutate({ txId: transaction.id, evidence })
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold"></div>
      </div>
    )
  }

  const pendingCount = pendingTransactions?.length || 0

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Pending Actions</h2>
          <span className="text-sm text-gray-500">{pendingCount} items requiring action</span>
        </div>
      </div>

      <div className="divide-y divide-gray-200">
        {pendingTransactions?.map((transaction) => (
          <div key={transaction.id} className="p-6 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div className={`p-2 rounded-lg ${
                  transaction.type === 'SENT' ? 'bg-blue-100' : 'bg-green-100'
                }`}>
                  <Package className={`w-5 h-5 ${
                    transaction.type === 'SENT' ? 'text-blue-600' : 'text-green-600'
                  }`} />
                </div>
                
                <div>
                  <h3 className="text-sm font-medium text-gray-900">
                    {transaction.type === 'SENT' ? 'Confirm Shipment Sent' : 'Confirm Receipt'}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{transaction.itemDescription}</p>
                  
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-500">
                      Partner: <span className="font-medium">{transaction.partner}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Value: <span className="font-medium">${transaction.value.toLocaleString()}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Created: {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleConfirm(transaction)}
                  disabled={confirmSentMutation.isPending || confirmReceivedMutation.isPending}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span className="text-sm">Confirm</span>
                </button>
                
                <button
                  onClick={() => setSelectedDispute(transaction)}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  <XCircle className="w-4 h-4" />
                  <span className="text-sm">Dispute</span>
                </button>
              </div>
            </div>

            {/* Warning for old transactions */}
            {new Date(transaction.createdAt).getTime() < Date.now() - 48 * 60 * 60 * 1000 && (
              <div className="mt-3 flex items-center space-x-2 text-amber-600">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-xs">This action is overdue and may affect your trust score</span>
              </div>
            )}
          </div>
        ))}

        {pendingCount === 0 && (
          <div className="p-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-600">No pending actions</p>
            <p className="text-sm text-gray-500 mt-1">All transactions are up to date</p>
          </div>
        )}
      </div>

      {/* Dispute Modal */}
      <DisputeModal
        isOpen={!!selectedDispute}
        onClose={() => setSelectedDispute(null)}
        transactionId={selectedDispute?.id || ''}
        transactionDetails={{
          partner: selectedDispute?.partner || '',
          itemDescription: selectedDispute?.itemDescription || '',
          value: selectedDispute?.value || 0
        }}
      />
    </div>
  )
}