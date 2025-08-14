'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { DollarSign, Clock, CheckCircle, XCircle, AlertCircle, FileText } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/stores/auth-store'

interface Compensation {
  id: string
  transactionId: string
  disputeId: string
  affectedParty: string
  compensationAmount: number
  reason: string
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PAID'
  createdAt: string
  approvedAt?: string
  approvedBy?: string
  details?: any
}

export function CompensationManagement() {
  const api = useApi()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [selectedCompensation, setSelectedCompensation] = useState<Compensation | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [approvalNotes, setApprovalNotes] = useState('')

  // Fetch pending compensations
  const { data: pendingCompensations, isLoading } = useQuery({
    queryKey: ['pending-compensations'],
    queryFn: async () => {
      if (!api) return []
      const { data } = await api.get<Compensation[]>('/api/consensus/compensation/pending')
      return data
    },
    enabled: !!api
  })

  // Approve compensation mutation
  const approveMutation = useMutation({
    mutationFn: async ({ transactionId, notes }: { transactionId: string; notes?: string }) => {
      if (!api) throw new Error('API not available')
      const { data } = await api.post(`/api/consensus/compensation/approve/${transactionId}`, { notes })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-compensations'] })
      setSelectedCompensation(null)
      setApprovalNotes('')
    }
  })

  // Reject compensation mutation
  const rejectMutation = useMutation({
    mutationFn: async ({ transactionId, reason }: { transactionId: string; reason: string }) => {
      if (!api) throw new Error('API not available')
      const { data } = await api.post(`/api/consensus/compensation/reject/${transactionId}`, { reason })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-compensations'] })
      setSelectedCompensation(null)
      setRejectReason('')
    }
  })

  const handleApprove = (compensation: Compensation) => {
    setSelectedCompensation(compensation)
    setShowDetails(true)
  }

  const confirmApproval = () => {
    if (selectedCompensation) {
      approveMutation.mutate({ 
        transactionId: selectedCompensation.transactionId,
        notes: approvalNotes || undefined
      })
      setShowDetails(false)
    }
  }

  const confirmRejection = () => {
    if (selectedCompensation && rejectReason) {
      rejectMutation.mutate({
        transactionId: selectedCompensation.transactionId,
        reason: rejectReason
      })
      setShowDetails(false)
    }
  }

  const totalPending = pendingCompensations?.length || 0
  const totalAmount = pendingCompensations?.reduce((sum, c) => sum + c.compensationAmount, 0) || 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pending Requests</p>
              <p className="text-3xl font-bold text-gray-900">{totalPending}</p>
            </div>
            <Clock className="w-10 h-10 text-yellow-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Pending Amount</p>
              <p className="text-3xl font-bold text-gray-900">${totalAmount.toLocaleString()}</p>
            </div>
            <DollarSign className="w-10 h-10 text-yellow-500" />
          </div>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Average Amount</p>
              <p className="text-3xl font-bold text-gray-900">
                ${totalPending > 0 ? Math.round(totalAmount / totalPending).toLocaleString() : 0}
              </p>
            </div>
            <FileText className="w-10 h-10 text-blue-500" />
          </div>
        </div>
      </div>

      {/* Pending Compensations List */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Pending Compensation Requests</h3>
        </div>
        
        {totalPending > 0 ? (
          <div className="divide-y divide-gray-200">
            {pendingCompensations?.map((compensation) => (
              <div key={compensation.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                        <Clock className="w-3 h-3 mr-1" />
                        Pending Review
                      </span>
                      <span className="text-sm text-gray-500">
                        {format(new Date(compensation.createdAt), 'MMM dd, yyyy HH:mm')}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-gray-500">Transaction ID</p>
                        <p className="font-mono text-gray-900">{compensation.transactionId.substring(0, 12)}...</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Dispute ID</p>
                        <p className="font-mono text-gray-900">{compensation.disputeId.substring(0, 12)}...</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Affected Party</p>
                        <p className="font-medium text-gray-900">{compensation.affectedParty}</p>
                      </div>
                      <div>
                        <p className="text-gray-500">Compensation Amount</p>
                        <p className="font-bold text-xl text-gray-900">${compensation.compensationAmount.toLocaleString()}</p>
                      </div>
                    </div>
                    
                    <div className="mt-3">
                      <p className="text-gray-500 text-sm">Reason</p>
                      <p className="text-gray-900">{compensation.reason}</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 ml-4">
                    <button
                      onClick={() => handleApprove(compensation)}
                      className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Review
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
            <p className="text-gray-600">No pending compensation requests</p>
            <p className="text-sm text-gray-500 mt-1">All requests have been processed</p>
          </div>
        )}
      </div>

      {/* Approval/Rejection Modal */}
      {showDetails && selectedCompensation && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <h3 className="text-xl font-semibold mb-4">Review Compensation Request</h3>
            
            <div className="space-y-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Transaction ID</p>
                  <p className="font-mono">{selectedCompensation.transactionId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Dispute ID</p>
                  <p className="font-mono">{selectedCompensation.disputeId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Affected Party</p>
                  <p className="font-medium">{selectedCompensation.affectedParty}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Amount</p>
                  <p className="text-2xl font-bold text-luxury-gold">
                    ${selectedCompensation.compensationAmount.toLocaleString()}
                  </p>
                </div>
              </div>
              
              <div>
                <p className="text-sm text-gray-500 mb-1">Reason</p>
                <p className="p-3 bg-gray-50 rounded">{selectedCompensation.reason}</p>
              </div>

              {selectedCompensation.details && (
                <div>
                  <p className="text-sm text-gray-500 mb-1">Additional Details</p>
                  <pre className="p-3 bg-gray-50 rounded text-sm overflow-x-auto">
                    {JSON.stringify(selectedCompensation.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Approval Notes (Optional)
                </label>
                <textarea
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="Add any notes for approval..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rejection Reason (Required for rejection)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Provide reason for rejection..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
                  rows={3}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDetails(false)
                  setApprovalNotes('')
                  setRejectReason('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmRejection}
                disabled={!rejectReason || rejectMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                <XCircle className="w-4 h-4 inline mr-2" />
                Reject
              </button>
              <button
                onClick={confirmApproval}
                disabled={approveMutation.isPending}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                <CheckCircle className="w-4 h-4 inline mr-2" />
                Approve
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}