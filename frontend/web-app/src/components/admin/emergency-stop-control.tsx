'use client'

import React, { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Shield, PlayCircle, StopCircle, Clock, CheckCircle } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/stores/auth-store'
import { format } from 'date-fns'

interface EmergencyStatus {
  isActive: boolean
  triggeredBy?: string
  triggeredAt?: string
  reason?: string
  affectedTransactions?: number
}

export function EmergencyStopControl() {
  const api = useApi()
  const { user } = useAuthStore()
  const queryClient = useQueryClient()
  const [showTriggerModal, setShowTriggerModal] = useState(false)
  const [triggerReason, setTriggerReason] = useState('')

  // Fetch emergency status
  const { data: status, isLoading } = useQuery({
    queryKey: ['emergency-status'],
    queryFn: async () => {
      if (!api) return null
      const { data } = await api.get<EmergencyStatus>('/api/consensus/emergency/status')
      return data
    },
    enabled: !!api,
    refetchInterval: 5000 // Poll every 5 seconds
  })

  // Trigger emergency stop
  const triggerMutation = useMutation({
    mutationFn: async (reason: string) => {
      if (!api) throw new Error('API not available')
      const { data } = await api.post('/api/consensus/emergency/stop', { reason })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emergency-status'] })
      setShowTriggerModal(false)
      setTriggerReason('')
    }
  })

  // Resume operations
  const resumeMutation = useMutation({
    mutationFn: async () => {
      if (!api) throw new Error('API not available')
      const { data } = await api.post('/api/consensus/emergency/resume')
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['emergency-status'] })
    }
  })

  const handleTriggerStop = () => {
    if (triggerReason.trim()) {
      triggerMutation.mutate(triggerReason)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Current Status */}
      <div className={`rounded-lg p-6 ${
        status?.isActive 
          ? 'bg-red-50 border-2 border-red-500' 
          : 'bg-green-50 border-2 border-green-500'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {status?.isActive ? (
              <StopCircle className="w-12 h-12 text-red-600" />
            ) : (
              <CheckCircle className="w-12 h-12 text-green-600" />
            )}
            <div>
              <h2 className="text-2xl font-bold text-gray-900">
                System Status: {status?.isActive ? 'EMERGENCY STOP ACTIVE' : 'Normal Operations'}
              </h2>
              {status?.isActive && (
                <>
                  <p className="text-gray-700 mt-1">
                    Triggered by: {status.triggeredBy}
                  </p>
                  <p className="text-gray-700">
                    Time: {status.triggeredAt && format(new Date(status.triggeredAt), 'MMM dd, yyyy HH:mm:ss')}
                  </p>
                  <p className="text-gray-700">
                    Reason: {status.reason}
                  </p>
                  <p className="text-gray-700">
                    Affected transactions: {status.affectedTransactions || 0}
                  </p>
                </>
              )}
            </div>
          </div>

          <div>
            {status?.isActive ? (
              <button
                onClick={() => resumeMutation.mutate()}
                disabled={resumeMutation.isPending}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                <PlayCircle className="w-5 h-5" />
                Resume Operations
              </button>
            ) : (
              <button
                onClick={() => setShowTriggerModal(true)}
                className="flex items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                <StopCircle className="w-5 h-5" />
                Trigger Emergency Stop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Emergency Stop Guidelines */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Emergency Stop Guidelines</h3>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-900">When to Trigger</h4>
              <ul className="text-sm text-gray-600 mt-1 space-y-1">
                <li>• Suspected security breach or fraud detected</li>
                <li>• Critical system malfunction affecting consensus</li>
                <li>• Major dispute affecting multiple high-value transactions</li>
                <li>• External regulatory or compliance requirement</li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-blue-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-900">Effects of Emergency Stop</h4>
              <ul className="text-sm text-gray-600 mt-1 space-y-1">
                <li>• All new transactions will be blocked</li>
                <li>• Pending confirmations will be frozen</li>
                <li>• Dispute resolutions will be paused</li>
                <li>• All participants will be notified</li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <PlayCircle className="w-5 h-5 text-green-500 mt-0.5" />
            <div>
              <h4 className="font-medium text-gray-900">Resume Checklist</h4>
              <ul className="text-sm text-gray-600 mt-1 space-y-1">
                <li>• Ensure root cause has been identified and resolved</li>
                <li>• Verify all systems are operational</li>
                <li>• Review frozen transactions for integrity</li>
                <li>• Communicate resumption to all stakeholders</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Emergency Events */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Emergency Stop History</h3>
        </div>
        <div className="p-6">
          <p className="text-gray-500 text-center">No previous emergency stops recorded</p>
        </div>
      </div>

      {/* Trigger Modal */}
      {showTriggerModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
              <h3 className="text-xl font-semibold text-gray-900">Trigger Emergency Stop</h3>
            </div>

            <div className="mb-4">
              <p className="text-gray-600 mb-4">
                This will immediately halt all blockchain operations. Only trigger in case of serious issues.
              </p>
              
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason for Emergency Stop (Required)
              </label>
              <textarea
                value={triggerReason}
                onChange={(e) => setTriggerReason(e.target.value)}
                placeholder="Describe the reason for triggering emergency stop..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500"
                rows={4}
                required
              />
            </div>

            <div className="bg-red-50 border border-red-200 rounded p-3 mb-4">
              <p className="text-sm text-red-800">
                <strong>Warning:</strong> This action will affect all network participants and should only be used in genuine emergencies.
              </p>
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowTriggerModal(false)
                  setTriggerReason('')
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerStop}
                disabled={!triggerReason.trim() || triggerMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {triggerMutation.isPending ? 'Triggering...' : 'Confirm Emergency Stop'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}