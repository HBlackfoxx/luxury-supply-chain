'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { 
  AlertTriangle, 
  CheckCircle, 
  XCircle, 
  Clock, 
  FileText, 
  MessageSquare,
  Upload,
  Scale,
  Shield,
  TrendingUp,
  Eye
} from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/stores/auth-store'
import { DisputeModal } from './dispute-modal'
import { notifications } from '@/lib/notifications'

interface DisputeEvidence {
  id: string
  submittedBy: string
  timestamp: string
  description: string
  files?: string[]
}

interface Dispute {
  id: string
  transactionId: string
  initiator: string
  respondent: string
  sender?: string
  receiver?: string
  type: string
  reason: string
  status: 'OPEN' | 'INVESTIGATING' | 'RESOLVED' | 'ESCALATED'
  createdAt: string
  updatedAt: string
  resolution?: {
    disputeId?: string  // The actual dispute ID (e.g., DISPUTE-MAT-TRANSFER-xxx-timestamp)
    decision: string
    requiredAction?: 'RETURN' | 'RESEND' | 'REPLACE' | 'RESEND_PARTIAL' | 'NONE'
    compensationAmount?: number
    resolvedBy: string
    resolvedAt: string
    notes: string
    actionCompleted?: boolean
    followUpTxId?: string
  }
  evidence: DisputeEvidence[]
  transactionDetails: {
    itemDescription: string
    value: number
    sender: string
    receiver: string
    timestamp: string
    itemType?: 'PRODUCT' | 'BATCH' | 'MATERIAL'
    itemId?: string
    quantity?: number
  }
}

export function DisputeManagement() {
  const api = useApi()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [selectedDispute, setSelectedDispute] = useState<Dispute | null>(null)
  const [showEvidenceModal, setShowEvidenceModal] = useState(false)
  const [showResolutionModal, setShowResolutionModal] = useState(false)
  const [newEvidence, setNewEvidence] = useState({
    description: '',
    files: [] as File[]
  })
  const [resolution, setResolution] = useState({
    decision: '',
    compensationAmount: 0,
    notes: ''
  })

  // Fetch disputes for the user's organization
  const { data: disputes, isLoading } = useQuery({
    queryKey: ['organization-disputes', user?.organization],
    queryFn: async () => {
      if (!api || !user) return []
      const { data } = await api.get<Dispute[]>('/api/consensus/disputes')
      return data
    },
    enabled: !!api && !!user,
    refetchInterval: 30000 // Refresh every 30 seconds
  })

  // Add evidence mutation
  const addEvidenceMutation = useMutation({
    mutationFn: async ({ disputeId, evidence }: { disputeId: string; evidence: typeof newEvidence }) => {
      if (!api) throw new Error('API not available')
      const { data } = await api.post(`/api/consensus/dispute/${disputeId}/evidence`, {
        description: evidence.description,
        files: evidence.files.map(f => f.name)
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-disputes'] })
      notifications.evidenceSubmitted()
      setShowEvidenceModal(false)
      setNewEvidence({ description: '', files: [] })
    }
  })

  // Resolve dispute mutation (for admins not involved in the dispute)
  const resolveDisputeMutation = useMutation({
    mutationFn: async ({ disputeId, resolution }: { disputeId: string; resolution: any }) => {
      if (!api) throw new Error('API not available')
      const { data } = await api.post(`/api/consensus/dispute/${disputeId}/resolve`, resolution)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-disputes'] })
      notifications.disputeResolved(selectedDispute?.id || 'Dispute')
      setShowResolutionModal(false)
      setSelectedDispute(null)
      setResolution({ decision: '', compensationAmount: 0, notes: '' })
    }
  })

  // Accept dispute mutation (for party admitting fault)
  const acceptDisputeMutation = useMutation({
    mutationFn: async (disputeId: string) => {
      if (!api) throw new Error('API not available')
      const { data } = await api.post(`/api/consensus/dispute/${disputeId}/accept`)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-disputes'] })
      notifications.success('Dispute accepted. The other party has been notified.')
      setSelectedDispute(null)
    }
  })

  // Create return transfer after dispute resolution
  const createReturnTransferMutation = useMutation({
    mutationFn: async (disputeId: string) => {
      if (!api) throw new Error('API not available')
      console.log('Creating return transfer with dispute ID:', disputeId)
      const url = `/api/supply-chain/dispute/${disputeId}/create-return`
      console.log('Request URL:', url)
      const { data } = await api.post(url)
      return data
    },
    onSuccess: async () => {
      // Force refresh disputes to get updated actionCompleted status
      await queryClient.invalidateQueries({ queryKey: ['organization-disputes'] })
      await queryClient.refetchQueries({ queryKey: ['organization-disputes'] })
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      notifications.success('Return transfer created successfully')
    },
    onError: (error: any) => {
      // Check if error is due to duplicate creation
      if (error.response?.data?.message?.includes('already created')) {
        notifications.success('Return transfer has already been created for this dispute')
        // Refresh disputes to update UI
        queryClient.invalidateQueries({ queryKey: ['organization-disputes'] })
      } else {
        notifications.success('Failed to create return transfer. Please try again.')
      }
    }
  })

  // Process return transfer
  const processReturnMutation = useMutation({
    mutationFn: async ({ transferId, itemType, itemId, quantity }: { 
      transferId: string
      itemType: 'PRODUCT' | 'BATCH' | 'MATERIAL'
      itemId: string
      quantity?: number
    }) => {
      if (!api) throw new Error('API not available')
      const { data } = await api.post(`/api/supply-chain/transfer/${transferId}/process-return`, {
        itemType,
        itemId,
        quantity: quantity || 1
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] })
      queryClient.invalidateQueries({ queryKey: ['organization-disputes'] })
      notifications.success('Return processed successfully')
    }
  })

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'OPEN':
        return 'bg-yellow-100 text-yellow-800'
      case 'INVESTIGATING':
        return 'bg-blue-100 text-blue-800'
      case 'RESOLVED':
        return 'bg-green-100 text-green-800'
      case 'ESCALATED':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getDisputeTypeLabel = (type: string) => {
    const types: Record<string, string> = {
      'NOT_RECEIVED': 'Goods Not Received',
      'DAMAGED': 'Goods Damaged',
      'WRONG_ITEM': 'Wrong Item',
      'DEFECTIVE': 'Defective Product',
      'QUALITY_ISSUE': 'Quality Issues',
      'QUANTITY_MISMATCH': 'Quantity Mismatch',
      'NOT_SENT': 'Not Sent by Sender',
      'NOT_CONFIRMING': 'Receiver Not Confirming',
      'TIMEOUT': 'Partner Not Responding'
    }
    return types[type] || type
  }

  // Check if user can resolve a dispute (admin not involved in it)
  const canResolveDispute = (dispute: Dispute) => {
    return user?.role === 'admin' && 
           user?.organization !== dispute.initiator && 
           user?.organization !== dispute.respondent
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold"></div>
      </div>
    )
  }

  // Separate disputes into categories
  const myDisputes = disputes?.filter(d => 
    d.initiator === user?.organization || d.respondent === user?.organization
  ) || []
  
  const disputesToResolve = disputes?.filter(d => 
    canResolveDispute(d) && (d.status === 'OPEN' || d.status === 'INVESTIGATING')
  ) || []

  const activeDisputes = myDisputes.filter(d => d.status !== 'RESOLVED')
  const resolvedDisputes = myDisputes.filter(d => d.status === 'RESOLVED')

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Dispute Management</h2>
        <p className="text-gray-600">Manage disputes with your trading partners</p>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Active Disputes</p>
              <p className="text-2xl font-bold text-gray-900">{activeDisputes.length}</p>
            </div>
            <AlertTriangle className="w-8 h-8 text-yellow-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Resolved</p>
              <p className="text-2xl font-bold text-gray-900">{resolvedDisputes.length}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-500" />
          </div>
        </div>
        
        {user?.role === 'admin' && (
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">To Arbitrate</p>
                <p className="text-2xl font-bold text-gray-900">{disputesToResolve.length}</p>
              </div>
              <Scale className="w-8 h-8 text-purple-500" />
            </div>
          </div>
        )}
        
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Success Rate</p>
              <p className="text-2xl font-bold text-gray-900">
                {myDisputes.length > 0 
                  ? `${Math.round((resolvedDisputes.length / myDisputes.length) * 100)}%`
                  : 'N/A'}
              </p>
            </div>
            <TrendingUp className="w-8 h-8 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Disputes to Arbitrate (Admin Only) */}
      {user?.role === 'admin' && disputesToResolve.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200 bg-purple-50">
            <div className="flex items-center gap-2">
              <Scale className="w-5 h-5 text-purple-600" />
              <h3 className="text-lg font-semibold text-gray-900">Disputes to Arbitrate</h3>
              <span className="text-sm text-purple-600">(You are a neutral party)</span>
            </div>
          </div>
          
          <div className="divide-y divide-gray-200">
            {disputesToResolve.map((dispute) => (
              <div key={dispute.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(dispute.status)}`}>
                        {dispute.status}
                      </span>
                      <span className="text-sm text-gray-500">
                        {dispute.initiator} vs {dispute.respondent}
                      </span>
                    </div>
                    
                    <p className="text-sm font-medium mb-1">{getDisputeTypeLabel(dispute.type)}</p>
                    <p className="text-sm text-gray-600">{dispute.reason}</p>
                    
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                      <span>Value: ${dispute.transactionDetails?.value?.toLocaleString()}</span>
                      <span>Evidence: {dispute.evidence?.length || 0} items</span>
                      <span>Created: {format(new Date(dispute.createdAt), 'MMM dd')}</span>
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => setSelectedDispute(dispute)}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        setSelectedDispute(dispute)
                        setShowResolutionModal(true)
                      }}
                      className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded hover:bg-purple-700"
                    >
                      Resolve
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Active Disputes */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">My Active Disputes</h3>
        </div>
        
        {activeDisputes.length > 0 ? (
          <div className="divide-y divide-gray-200">
            {activeDisputes.map((dispute) => (
              <div key={dispute.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(dispute.status)}`}>
                        {dispute.status}
                      </span>
                      {dispute.initiator === user?.organization ? (
                        <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                          You Initiated vs {dispute.respondent}
                        </span>
                      ) : (
                        <span className="text-xs bg-orange-100 text-orange-800 px-2 py-0.5 rounded">
                          {dispute.initiator} Initiated Against You
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="text-sm text-gray-500">Type</p>
                        <p className="font-medium">{getDisputeTypeLabel(dispute.type)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Transaction Value</p>
                        <p className="font-medium">${dispute.transactionDetails?.value?.toLocaleString() || 0}</p>
                      </div>
                    </div>
                    
                    <div className="mb-3">
                      <p className="text-sm text-gray-500">Reason</p>
                      <p className="text-gray-900">{dispute.reason}</p>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <div className="flex items-center gap-1">
                        <FileText className="w-4 h-4" />
                        {dispute.evidence?.length || 0} evidence items
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        {format(new Date(dispute.createdAt), 'MMM dd, yyyy')}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      onClick={() => setSelectedDispute(dispute)}
                      className="px-3 py-1.5 text-sm bg-luxury-gold text-white rounded hover:bg-luxury-dark"
                    >
                      View Details
                    </button>
                    {dispute.status === 'OPEN' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedDispute(dispute)
                            setShowEvidenceModal(true)
                          }}
                          className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Add Evidence
                        </button>
                        {dispute.respondent === user?.organization && (
                          <button
                            onClick={() => {
                              if (confirm('Are you sure you want to accept this dispute? This acknowledges fault on your part.')) {
                                acceptDisputeMutation.mutate(dispute.id)
                              }
                            }}
                            disabled={acceptDisputeMutation.isPending}
                            className="px-3 py-1.5 text-sm bg-orange-600 text-white rounded hover:bg-orange-700 disabled:opacity-50"
                          >
                            Accept Dispute
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No active disputes</p>
            <p className="text-sm text-gray-500 mt-1">All clear with your trading partners</p>
          </div>
        )}
      </div>

      {/* Resolved Disputes History */}
      {resolvedDisputes.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Resolved Disputes</h3>
          </div>
          
          <div className="divide-y divide-gray-200">
            {resolvedDisputes.slice(0, 5).map((dispute) => (
              <div key={dispute.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <CheckCircle className="w-5 h-5 text-green-500" />
                    <div>
                      <p className="text-sm font-medium">
                        {getDisputeTypeLabel(dispute.type)} with {
                          dispute.initiator === user?.organization ? dispute.respondent : dispute.initiator
                        }
                      </p>
                      <p className="text-xs text-gray-500">
                        Resolved on {dispute.resolution && format(new Date(dispute.resolution.resolvedAt), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setSelectedDispute(dispute)}
                      className="text-sm text-luxury-gold hover:text-luxury-dark"
                    >
                      View
                    </button>
                    {dispute.resolution?.decision?.includes('FAVOR') && 
                     !dispute.resolution?.actionCompleted && 
                     dispute.initiator === user?.organization && (
                      <>
                        <button
                          onClick={() => {
                            if (confirm('Create a return transfer based on this dispute resolution?')) {
                              // Use the actual dispute ID from resolution, fallback to transaction ID
                              const disputeIdToUse = dispute.resolution?.disputeId || dispute.id
                              console.log('Dispute object:', dispute)
                              console.log('Resolution object:', dispute.resolution)
                              console.log('Using dispute ID:', disputeIdToUse)
                              createReturnTransferMutation.mutate(disputeIdToUse)
                            }
                          }}
                          disabled={createReturnTransferMutation.isPending}
                          className="text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                          Create Return
                        </button>
                        {dispute.resolution?.followUpTxId && dispute.initiator === user?.organization && (
                          <button
                            onClick={() => {
                              const itemType = dispute.transactionDetails?.itemType || 'PRODUCT'
                              const itemId = dispute.transactionDetails?.itemId || dispute.transactionId
                              const quantity = dispute.transactionDetails?.quantity
                              
                              if (confirm(`Process ${itemType.toLowerCase()} return?`) && dispute.resolution?.followUpTxId) {
                                processReturnMutation.mutate({
                                  transferId: dispute.resolution.followUpTxId,
                                  itemType,
                                  itemId,
                                  quantity
                                })
                              }
                            }}
                            disabled={processReturnMutation.isPending}
                            className="text-sm text-green-600 hover:text-green-700 disabled:opacity-50"
                          >
                            Process Return
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dispute Details Modal */}
      {selectedDispute && !showEvidenceModal && !showResolutionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">Dispute Details</h3>
              <button
                onClick={() => setSelectedDispute(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div className="space-y-6">
              {/* Dispute Information */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedDispute.status)}`}>
                    {selectedDispute.status}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Type</p>
                  <p>{getDisputeTypeLabel(selectedDispute.type)}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Initiator</p>
                  <p className="font-medium">{selectedDispute.initiator}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Respondent</p>
                  <p className="font-medium">{selectedDispute.respondent}</p>
                </div>
              </div>

              {/* Reason */}
              <div>
                <h4 className="font-medium mb-2">Dispute Reason</h4>
                <p className="text-gray-700">{selectedDispute.reason}</p>
              </div>

              {/* Transaction Details */}
              <div>
                <h4 className="font-medium mb-2">Transaction Details</h4>
                <div className="bg-gray-50 rounded p-3 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Item</span>
                    <span className="text-sm">{selectedDispute.transactionDetails?.itemDescription}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Value</span>
                    <span className="text-sm font-medium">${selectedDispute.transactionDetails?.value?.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-500">Transaction ID</span>
                    <span className="text-sm font-mono">{selectedDispute.transactionId.substring(0, 12)}...</span>
                  </div>
                </div>
              </div>

              {/* Evidence */}
              <div>
                <h4 className="font-medium mb-2">Evidence ({selectedDispute.evidence?.length || 0} items)</h4>
                <div className="space-y-2">
                  {selectedDispute.evidence?.map((evidence) => (
                    <div key={evidence.id} className="border rounded p-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium">{evidence.submittedBy}</p>
                          <p className="text-sm text-gray-600">{evidence.description}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {format(new Date(evidence.timestamp), 'MMM dd, yyyy HH:mm')}
                          </p>
                        </div>
                        {evidence.files && evidence.files.length > 0 && (
                          <div className="text-sm text-gray-500">
                            <FileText className="w-4 h-4 inline mr-1" />
                            {evidence.files.length} files
                          </div>
                        )}
                      </div>
                    </div>
                  )) || <p className="text-sm text-gray-500">No evidence submitted yet</p>}
                </div>
              </div>

              {/* Resolution (if resolved) */}
              {selectedDispute.resolution && (
                <div>
                  <h4 className="font-medium mb-2">Resolution</h4>
                  <div className="bg-green-50 border border-green-200 rounded p-3">
                    <div className="mb-2">
                      <span className="text-sm font-medium text-green-900">Decision: </span>
                      <span className="text-sm text-green-800">
                        {selectedDispute.resolution.decision === 'IN_FAVOR_SENDER' ? 
                          `In favor of ${selectedDispute.initiator === selectedDispute.sender ? 'initiator' : 'respondent'} (${selectedDispute.sender})` :
                          selectedDispute.resolution.decision === 'IN_FAVOR_RECEIVER' ?
                          `In favor of ${selectedDispute.initiator === selectedDispute.receiver ? 'initiator' : 'respondent'} (${selectedDispute.receiver})` :
                          selectedDispute.resolution.decision}
                      </span>
                    </div>
                    {selectedDispute.resolution.requiredAction && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-green-900">Required Action: </span>
                        <span className="text-sm text-green-800">
                          {selectedDispute.resolution.requiredAction === 'RETURN' ? '📦 Return items to sender' :
                           selectedDispute.resolution.requiredAction === 'RESEND' ? '🔄 Resend items to receiver' :
                           selectedDispute.resolution.requiredAction === 'REPLACE' ? '🔧 Replace defective items' :
                           selectedDispute.resolution.requiredAction === 'RESEND_PARTIAL' ? '📦 Send missing quantity' :
                           selectedDispute.resolution.requiredAction}
                        </span>
                      </div>
                    )}
                    {(selectedDispute.resolution.requiredAction === 'RETURN' || 
                      selectedDispute.resolution.requiredAction === 'RESEND' || 
                      selectedDispute.resolution.requiredAction === 'REPLACE' ||
                      selectedDispute.resolution.requiredAction === 'RESEND_PARTIAL') && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-green-900">Action Quantity: </span>
                        <span className="text-sm text-green-800">
                          {selectedDispute.transactionDetails?.quantity || 'N/A'} units
                        </span>
                      </div>
                    )}
                    {selectedDispute.resolution.compensationAmount && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-green-900">Compensation: </span>
                        <span className="text-sm text-green-800">
                          ${selectedDispute.resolution.compensationAmount.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {selectedDispute.resolution.notes && (
                      <div className="mb-2">
                        <span className="text-sm font-medium text-green-900">Notes: </span>
                        <span className="text-sm text-green-800">{selectedDispute.resolution.notes}</span>
                      </div>
                    )}
                    <p className="text-xs text-green-600 mt-2">
                      Resolved by {selectedDispute.resolution.resolvedBy} on{' '}
                      {format(new Date(selectedDispute.resolution.resolvedAt), 'MMM dd, yyyy')}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setSelectedDispute(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Evidence Modal */}
      {showEvidenceModal && selectedDispute && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <h3 className="text-xl font-semibold mb-4">Add Evidence</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={newEvidence.description}
                  onChange={(e) => setNewEvidence({ ...newEvidence, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
                  placeholder="Describe the evidence you're submitting..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Files (Optional)</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600">
                      <label htmlFor="evidence-upload" className="relative cursor-pointer rounded-md font-medium text-luxury-gold hover:text-luxury-dark">
                        <span>Upload files</span>
                        <input
                          id="evidence-upload"
                          type="file"
                          className="sr-only"
                          multiple
                          onChange={(e) => {
                            if (e.target.files) {
                              setNewEvidence({ ...newEvidence, files: Array.from(e.target.files) })
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
                {newEvidence.files.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {newEvidence.files.map((file, idx) => (
                      <div key={idx} className="flex items-center text-sm text-gray-600">
                        <FileText className="w-4 h-4 mr-1" />
                        {file.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowEvidenceModal(false)
                  setNewEvidence({ description: '', files: [] })
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newEvidence.description) {
                    addEvidenceMutation.mutate({
                      disputeId: selectedDispute.id,
                      evidence: newEvidence
                    })
                  }
                }}
                disabled={!newEvidence.description || addEvidenceMutation.isPending}
                className="px-4 py-2 bg-luxury-gold text-white rounded-lg hover:bg-luxury-dark disabled:opacity-50"
              >
                Submit Evidence
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resolve Dispute Modal (Admin Only, Not Involved) */}
      {showResolutionModal && selectedDispute && canResolveDispute(selectedDispute) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <div className="flex items-center gap-3 mb-4">
              <Scale className="w-6 h-6 text-purple-600" />
              <h3 className="text-xl font-semibold">Arbitrate Dispute</h3>
            </div>
            
            <div className="mb-4 p-3 bg-purple-50 border border-purple-200 rounded">
              <p className="text-sm text-purple-800">
                You are acting as a neutral arbitrator between <strong>{selectedDispute.initiator}</strong> and{' '}
                <strong>{selectedDispute.respondent}</strong>
              </p>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Decision</label>
                <select
                  value={resolution.decision}
                  onChange={(e) => setResolution({ ...resolution, decision: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
                  required
                >
                  <option value="">Select decision...</option>
                  <option value="IN_FAVOR_INITIATOR">In Favor of {selectedDispute.initiator}</option>
                  <option value="IN_FAVOR_RESPONDENT">In Favor of {selectedDispute.respondent}</option>
                  <option value="SPLIT_RESOLUTION">Split Resolution (Both Partially At Fault)</option>
                  <option value="NO_FAULT">No Fault Found</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Compensation Amount (if applicable)
                </label>
                <input
                  type="number"
                  value={resolution.compensationAmount}
                  onChange={(e) => setResolution({ ...resolution, compensationAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Resolution Notes</label>
                <textarea
                  value={resolution.notes}
                  onChange={(e) => setResolution({ ...resolution, notes: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
                  placeholder="Explain your decision based on the evidence..."
                  required
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowResolutionModal(false)
                  setResolution({ decision: '', compensationAmount: 0, notes: '' })
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (resolution.decision && resolution.notes) {
                    resolveDisputeMutation.mutate({
                      disputeId: selectedDispute.id,
                      resolution
                    })
                  }
                }}
                disabled={!resolution.decision || !resolution.notes || resolveDisputeMutation.isPending}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                Submit Resolution
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}