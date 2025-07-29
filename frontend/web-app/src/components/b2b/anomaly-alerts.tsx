'use client'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { AlertTriangle, Shield, TrendingUp, Clock } from 'lucide-react'
import { useState } from 'react'

interface Anomaly {
  id: string
  type: 'routing' | 'timing' | 'value' | 'frequency' | 'relationship'
  severity: 'low' | 'medium' | 'high' | 'critical'
  transactionId: string
  description: string
  detectedAt: string
  recommendedAction: string
}

export function AnomalyAlerts() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const { data: anomalies } = useQuery({
    queryKey: ['anomalies'],
    queryFn: async () => {
      // In production, this would be a real endpoint
      // For now, using mock data to show UI
      return [
        {
          id: '1',
          type: 'timing',
          severity: 'medium',
          transactionId: 'TX-123',
          description: 'Unusually fast confirmation from ItalianLeather (2 min vs avg 2 hours)',
          detectedAt: new Date().toISOString(),
          recommendedAction: 'Review transaction details'
        },
        {
          id: '2',
          type: 'value',
          severity: 'high',
          transactionId: 'TX-456',
          description: 'Transaction value 300% higher than usual for this item type',
          detectedAt: new Date(Date.now() - 3600000).toISOString(),
          recommendedAction: 'Verify pricing and quantity'
        }
      ] as Anomaly[]
    },
    refetchInterval: 60000 // Check every minute
  })

  const activeAnomalies = anomalies?.filter(a => !dismissed.has(a.id)) || []

  if (activeAnomalies.length === 0) return null

  const getIcon = (type: string) => {
    switch (type) {
      case 'timing': return Clock
      case 'value': return TrendingUp
      default: return AlertTriangle
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default: return 'bg-blue-100 text-blue-800 border-blue-200'
    }
  }

  return (
    <div className="mb-6 space-y-3">
      <div className="flex items-center space-x-2 text-sm text-gray-600">
        <Shield className="w-4 h-4" />
        <span className="font-medium">Anomaly Detection Active</span>
      </div>

      {activeAnomalies.map(anomaly => {
        const Icon = getIcon(anomaly.type)
        
        return (
          <div
            key={anomaly.id}
            className={`p-4 rounded-lg border ${getSeverityColor(anomaly.severity)}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-3">
                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium">
                    {anomaly.type.charAt(0).toUpperCase() + anomaly.type.slice(1)} Anomaly Detected
                  </p>
                  <p className="text-sm mt-1">{anomaly.description}</p>
                  <div className="flex items-center space-x-4 mt-2 text-xs">
                    <span>Transaction: {anomaly.transactionId}</span>
                    <span>•</span>
                    <span>{new Date(anomaly.detectedAt).toLocaleTimeString()}</span>
                  </div>
                  <p className="text-sm font-medium mt-2">
                    Recommended: {anomaly.recommendedAction}
                  </p>
                </div>
              </div>
              
              <button
                onClick={() => setDismissed(new Set([...dismissed, anomaly.id]))}
                className="text-sm underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}