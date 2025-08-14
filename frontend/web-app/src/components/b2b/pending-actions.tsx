'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, Package, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DisputeModal } from './dispute-modal'
import { useAuthStore } from '@/stores/auth-store'
import { useApi } from '@/hooks/use-api'

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
  const { user } = useAuthStore()
  const [selectedDispute, setSelectedDispute] = useState<PendingTransaction | null>(null)
  const api = useApi()

  // Fetch pending transactions
  const { data: pendingTransactions, isLoading } = useQuery({
    queryKey: ['pending-transactions', user?.organization],
    queryFn: async () => {
      if (!user?.organization || !api) return []
      const response = await api.get<{
        count: number
        transactions: any[]
      }>(`/api/consensus/transactions/pending/${user.organization}`)
      
      // Transform backend transactions to match frontend structure
      const transformed = response.data.transactions.map((tx: any) => ({
        id: tx.id,
        type: tx.sender === user.organization ? 'SENT' as const : 'RECEIVED' as const,
        itemId: tx.itemDetails?.itemId || tx.metadata?.itemId || '',
        itemDescription: tx.itemDetails?.description || tx.metadata?.itemDescription || 'Item',
        partner: tx.sender === user.organization ? tx.receiver : tx.sender,
        value: tx.value || 0,
        status: 'PENDING_CONFIRMATION' as const,
        createdAt: tx.createdAt
      }))
      
      return transformed
    },
    enabled: !!user?.organization && !!api,
  })

  // Confirm sent mutation
  const confirmSentMutation = useMutation({
    mutationFn: async ({ txId, evidence }: { txId: string; evidence: any }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/consensus/transactions/${txId}/confirm-sent`, {
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
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/consensus/transactions/${txId}/confirm-received`, {
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
        {pendingTransactions && pendingTransactions.length > 0 && pendingTransactions.map((transaction: PendingTransaction) => (
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

        {(!pendingTransactions || pendingTransactions.length === 0) && (
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