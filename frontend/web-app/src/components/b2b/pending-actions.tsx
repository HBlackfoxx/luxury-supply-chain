'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Clock, Package, AlertTriangle } from 'lucide-react'
import { format } from 'date-fns'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DisputeModal } from './dispute-modal'
import { useAuthStore } from '@/stores/auth-store'
import { useApi } from '@/hooks/use-api'
import { notifications } from '@/lib/notifications'

interface PendingTransaction {
  id: string
  type: 'SENT' | 'RECEIVED'
  itemId: string
  itemDescription: string
  partner: string
  createdAt: string
  value: number
  status: 'PENDING_CONFIRMATION' | 'DISPUTED' | 'PENDING'
  transferType?: 'product' | 'material'
  materialId?: string
  canTakeAction?: boolean
  isWaitingForOther?: boolean
  isDisputed?: boolean
}

export function PendingActions() {
  const queryClient = useQueryClient()
  const { user } = useAuthStore()
  const [selectedDispute, setSelectedDispute] = useState<PendingTransaction | null>(null)
  const api = useApi()

  // Fetch return transfers separately
  const { data: returnTransfers } = useQuery({
    queryKey: ['return-transfers', user?.organization],
    queryFn: async () => {
      if (!api || !user?.organization) return []
      const response = await api.get<any[]>('/api/supply-chain/transfers/returns').catch(() => ({ data: [] }))
      return response.data
    },
    enabled: !!api && !!user?.organization,
  })

  // Fetch pending transactions (both product and material transfers)
  const { data: pendingTransactions, isLoading } = useQuery({
    queryKey: ['pending-transactions', user?.organization],
    queryFn: async () => {
      if (!user?.organization || !api) return []
      
      // Fetch pending transfers
      const transfersResponse = await api.get<any[]>('/api/supply-chain/transfers/pending').catch(() => ({ data: [] }))
      
      // Transform transfers
      const transformed = transfersResponse.data.map((transfer: any) => ({
        id: transfer.transferId || transfer.id,
        type: transfer.type || (transfer.from === user.organization ? 'SENT' as const : 'RECEIVED' as const),
        itemId: transfer.itemId || transfer.materialId,
        itemDescription: transfer.itemType === 'material' || transfer.transferType === 'material'
          ? `Material: ${transfer.metadata?.materialType || transfer.materialId}`
          : transfer.metadata?.resolutionType === 'dispute_resolution' 
          ? `RETURN: ${transfer.metadata?.materialType || transfer.itemDescription || 'Product'}`
          : transfer.itemDescription || 'Product',
        partner: transfer.from === user.organization ? transfer.to : transfer.from,
        value: transfer.metadata?.quantity || transfer.quantity || transfer.value || 0,
        status: transfer.status === 'DISPUTED' ? 'DISPUTED' as const : 'PENDING_CONFIRMATION' as const,
        createdAt: transfer.createdAt || transfer.initiatedAt || transfer.timestamp || new Date().toISOString(),
        transferType: (transfer.itemType || transfer.transferType || 'product') as 'product' | 'material',
        materialId: transfer.materialId,
        // Use backend flags to determine if actions can be taken
        canTakeAction: transfer.canTakeAction !== undefined ? transfer.canTakeAction : transfer.type === 'RECEIVED',
        isWaitingForOther: transfer.isWaitingForOther || false,
        isDisputed: transfer.isDisputed || transfer.status === 'DISPUTED'
      }))
      
      return transformed
    },
    enabled: !!user?.organization && !!api,
  })

  // Confirm sent mutation
  const confirmSentMutation = useMutation({
    mutationFn: async ({ txId, evidence }: { txId: string; evidence: any }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/transfer/${txId}/confirm-sent`, {
        evidence,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] })
      notifications.transactionConfirmed('Sent')
    },
  })

  // Confirm received mutation
  const confirmReceivedMutation = useMutation({
    mutationFn: async ({ txId, evidence }: { txId: string; evidence: any }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/transfer/${txId}/confirm-received`, {
        evidence,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] })
      notifications.transactionConfirmed('Received')
    },
  })

  // Confirm material receipt mutation
  const confirmMaterialReceiptMutation = useMutation({
    mutationFn: async ({ materialId, transferId }: { materialId: string; transferId: string }) => {
      if (!api) throw new Error('API not initialized')
      const { data } = await api.post(`/api/supply-chain/materials/${materialId}/confirm-receipt`, {
        transferId
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      notifications.materialReceived('Material')
    },
  })

  const handleConfirm = (transaction: PendingTransaction) => {
    // Handle material transfers differently
    if (transaction.transferType === 'material' && transaction.type === 'RECEIVED') {
      confirmMaterialReceiptMutation.mutate({ 
        materialId: transaction.materialId || transaction.itemId, 
        transferId: transaction.id 
      })
    } else {
      // Handle product transfers
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
                    {transaction.itemDescription.startsWith('RETURN:')
                      ? 'Confirm Return Transfer'
                      : transaction.isDisputed 
                      ? 'Transfer Disputed'
                      : transaction.isWaitingForOther 
                      ? `Waiting for ${transaction.partner} to confirm receipt`
                      : transaction.canTakeAction
                      ? 'Confirm Receipt'
                      : transaction.type === 'SENT' 
                      ? 'Confirm Shipment Sent' 
                      : 'Confirm Receipt'}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">{transaction.itemDescription}</p>
                  
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-500">
                      {transaction.type === 'SENT' ? 'To' : 'From'}: <span className="font-medium">{transaction.partner}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {transaction.transferType === 'material' ? 'Quantity' : 'Value'}: <span className="font-medium">{transaction.value.toLocaleString()}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      Created: {format(new Date(transaction.createdAt), 'MMM dd, yyyy HH:mm')}
                    </p>
                    {transaction.isDisputed && (
                      <p className="text-xs text-red-600 font-medium">
                        Status: DISPUTED - Pending resolution
                      </p>
                    )}
                    {!transaction.isDisputed && transaction.isWaitingForOther && (
                      <p className="text-xs text-amber-600 font-medium">
                        Status: Awaiting confirmation from receiver
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                {transaction.isDisputed ? (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => window.location.href = '/b2b/disputes'}
                      className="flex items-center space-x-1 px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors"
                    >
                      <AlertTriangle className="w-4 h-4" />
                      <span className="text-sm">View Dispute</span>
                    </button>
                  </div>
                ) : transaction.canTakeAction ? (
                  <>
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
                  </>
                ) : transaction.isWaitingForOther ? (
                  <div className="flex items-center space-x-2 text-sm text-gray-500">
                    <Clock className="w-4 h-4" />
                    <span>Waiting for confirmation</span>
                  </div>
                ) : (
                  // For product transfers that still use the old flow
                  <>
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
                  </>
                )}
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

      {/* Return Transfers Section */}
      {returnTransfers && returnTransfers.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
          <div className="px-6 py-4 border-b border-gray-200 bg-purple-50">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Dispute Return Transfers</h2>
              <span className="text-sm text-gray-500">{returnTransfers.length} return transfers</span>
            </div>
          </div>
          
          <div className="divide-y divide-gray-200">
            {returnTransfers.map((transfer: any) => (
              <div key={transfer.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-4">
                    <div className="p-2 rounded-lg bg-purple-100">
                      <Package className="w-5 h-5 text-purple-600" />
                    </div>
                    
                    <div>
                      <h3 className="text-sm font-medium text-gray-900">
                        {transfer.metadata?.requiredAction === 'RETURN' 
                          ? 'Return Transfer from Dispute Resolution'
                          : transfer.metadata?.requiredAction === 'RESEND'
                          ? 'Resend Transfer from Dispute Resolution'
                          : transfer.metadata?.requiredAction === 'REPLACE'
                          ? 'Replacement Transfer from Dispute Resolution'
                          : 'Transfer from Dispute Resolution'}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {transfer.metadata?.requiredAction === 'RETURN'
                          ? `Returning defective ${transfer.itemId ? `Material ID: ${transfer.itemId}` : 'Product'}`
                          : transfer.metadata?.requiredAction === 'RESEND'
                          ? `Resending ${transfer.itemId ? `Material ID: ${transfer.itemId}` : 'Product'}`
                          : transfer.metadata?.requiredAction === 'REPLACE'
                          ? `Replacing ${transfer.itemId ? `Material ID: ${transfer.itemId}` : 'Product'}`
                          : `Processing ${transfer.itemId ? `Material ID: ${transfer.itemId}` : 'Product'}`}
                      </p>
                      
                      <div className="mt-2 space-y-1">
                        <p className="text-xs text-gray-500">
                          {transfer.metadata?.requiredAction === 'RETURN'
                            ? <>Returning from: <span className="font-medium">{transfer.from}</span> → Back to: <span className="font-medium">{transfer.to}</span></>
                            : <>Sending from: <span className="font-medium">{transfer.from}</span> → To: <span className="font-medium">{transfer.to}</span></>}
                        </p>
                        <p className="text-xs text-gray-500">
                          {transfer.metadata?.requiredAction === 'RETURN' ? 'Return' : 'Transfer'} Quantity: <span className="font-medium">{transfer.metadata?.quantity || 1}</span>
                        </p>
                        <p className="text-xs text-gray-500">
                          Status: {transfer.consensusDetails?.senderConfirmed && transfer.consensusDetails?.receiverConfirmed 
                            ? <span className="text-green-600">{transfer.metadata?.requiredAction === 'RETURN' ? 'Return' : 'Transfer'} Completed</span>
                            : transfer.consensusDetails?.senderConfirmed 
                            ? <span className="text-blue-600">
                                {transfer.metadata?.requiredAction === 'RETURN' 
                                  ? 'Returned - Awaiting Supplier Confirmation'
                                  : 'Sent - Awaiting Manufacturer Confirmation'}
                              </span>
                            : <span className="text-amber-600">
                                {transfer.metadata?.requiredAction === 'RETURN'
                                  ? 'Awaiting Return Shipment from Manufacturer'
                                  : 'Awaiting Shipment from Supplier'}
                              </span>
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Manufacturer confirms sent */}
                    {transfer.canConfirm && (
                      <button
                        onClick={() => handleConfirm({
                          ...transfer,
                          type: 'SENT',
                          itemDescription: `Return: ${transfer.metadata?.materialType || 'Product'}`,
                          partner: transfer.to,
                          value: transfer.metadata?.quantity || 1,
                          status: 'PENDING_CONFIRMATION' as const,
                          createdAt: transfer.initiatedAt,
                          transferType: 'material' as const,
                          canTakeAction: true,
                          isWaitingForOther: false,
                          isDisputed: false
                        })}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm">
                          {transfer.metadata?.requiredAction === 'RETURN' 
                            ? 'Confirm Return Sent'
                            : transfer.metadata?.requiredAction === 'RESEND'
                            ? 'Confirm Resend Sent'
                            : 'Confirm Shipment Sent'}
                        </span>
                      </button>
                    )}
                    
                    {/* Supplier/Manufacturer can only confirm after sender confirms */}
                    {transfer.canReceive && transfer.consensusDetails?.senderConfirmed && (
                      <button
                        onClick={() => handleConfirm({
                          ...transfer,
                          type: 'RECEIVED',
                          itemDescription: `${transfer.metadata?.requiredAction || 'Transfer'}: ${transfer.metadata?.materialType || 'Product'}`,
                          partner: transfer.from,
                          value: transfer.metadata?.quantity || 1,
                          status: 'PENDING_CONFIRMATION' as const,
                          createdAt: transfer.initiatedAt,
                          transferType: 'material' as const,
                          materialId: transfer.itemId, // Add the itemId as materialId for return transfers
                          canTakeAction: true,
                          isWaitingForOther: false,
                          isDisputed: false
                        })}
                        className="flex items-center space-x-1 px-3 py-1.5 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span className="text-sm">
                          {transfer.metadata?.requiredAction === 'RETURN'
                            ? 'Confirm Return Received'
                            : transfer.metadata?.requiredAction === 'RESEND'
                            ? 'Confirm Resend Received'
                            : 'Confirm Receipt'}
                        </span>
                      </button>
                    )}
                    
                    {/* Waiting messages */}
                    {transfer.from === user?.organization && transfer.consensusDetails?.senderConfirmed && !transfer.consensusDetails?.receiverConfirmed && (
                      <div className="flex items-center space-x-2 text-sm text-amber-600">
                        <Clock className="w-4 h-4" />
                        <span>
                          {transfer.metadata?.requiredAction === 'RETURN'
                            ? 'Waiting for supplier to confirm return receipt'
                            : transfer.metadata?.requiredAction === 'RESEND'
                            ? 'Waiting for manufacturer to confirm receipt'
                            : 'Waiting for confirmation'}
                        </span>
                      </div>
                    )}
                    
                    {transfer.to === user?.organization && !transfer.consensusDetails?.senderConfirmed && (
                      <div className="flex items-center space-x-2 text-sm text-gray-500">
                        <Clock className="w-4 h-4" />
                        <span>
                          {transfer.metadata?.requiredAction === 'RETURN'
                            ? 'Waiting for manufacturer to ship return'
                            : transfer.metadata?.requiredAction === 'RESEND'
                            ? 'Waiting for supplier to ship replacement'
                            : 'Waiting for shipment'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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