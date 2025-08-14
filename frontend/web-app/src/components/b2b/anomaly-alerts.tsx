'use client'

import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Shield, TrendingUp, Clock } from 'lucide-react'
import { useState } from 'react'
import { useApi } from '@/hooks/use-api'

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
  const api = useApi()

  const { data: anomalies } = useQuery<Anomaly[]>({
    queryKey: ['anomalies'],
    queryFn: async () => {
      if (!api) return []
      
      try {
        // Get real transaction data to detect anomalies
        const [txRes, metricsRes] = await Promise.all([
          api.get('/api/consensus/transactions/history').catch(() => ({ data: [] })),
          api.get('/api/consensus/metrics').catch(() => ({ data: null }))
        ])
        
        const transactions = Array.isArray(txRes.data) ? txRes.data : []
        const metrics = metricsRes.data
        
        const detectedAnomalies: Anomaly[] = []
        const now = new Date()
        
        // Analyze transactions for anomalies
        transactions.forEach((tx: any) => {
          const txDate = new Date(tx.createdAt || tx.created)
          const confirmTime = tx.updatedAt 
            ? (new Date(tx.updatedAt).getTime() - txDate.getTime()) / (1000 * 60 * 60)
            : 0
          
          // 1. Timing anomaly - transactions taking too long
          if (confirmTime > 24 && tx.state === 'INITIATED') {
            detectedAnomalies.push({
              id: `timing-${tx.id}`,
              type: 'timing',
              severity: confirmTime > 48 ? 'high' : 'medium',
              transactionId: tx.id,
              description: `Transaction pending for ${Math.round(confirmTime)} hours (expected: < 24 hours)`,
              detectedAt: now.toISOString(),
              recommendedAction: 'Contact partner to confirm receipt'
            })
          }
          
          // 2. Value anomaly - unusually high transaction values
          if (tx.value && tx.value > 100000) {
            detectedAnomalies.push({
              id: `value-${tx.id}`,
              type: 'value',
              severity: tx.value > 500000 ? 'critical' : 'high',
              transactionId: tx.id,
              description: `High-value transaction detected: $${tx.value.toLocaleString()}`,
              detectedAt: now.toISOString(),
              recommendedAction: 'Verify transaction details and apply additional validation'
            })
          }
          
          // 3. Dispute frequency anomaly
          if (tx.state === 'DISPUTED') {
            const partnerDisputes = transactions.filter((t: any) => 
              (t.sender === tx.sender || t.receiver === tx.sender) && 
              t.state === 'DISPUTED'
            )
            
            if (partnerDisputes.length > 3) {
              detectedAnomalies.push({
                id: `frequency-${tx.sender}`,
                type: 'frequency',
                severity: 'high',
                transactionId: tx.id,
                description: `Partner ${tx.sender} has ${partnerDisputes.length} disputes`,
                detectedAt: now.toISOString(),
                recommendedAction: 'Review partner relationship and consider trust score adjustment'
              })
            }
          }
          
          // 4. Routing anomaly - unusual sender/receiver combinations
          const isNewRelationship = transactions.filter((t: any) => 
            (t.sender === tx.sender && t.receiver === tx.receiver) ||
            (t.sender === tx.receiver && t.receiver === tx.sender)
          ).length === 1
          
          if (isNewRelationship && tx.value > 50000) {
            detectedAnomalies.push({
              id: `relationship-${tx.id}`,
              type: 'relationship',
              severity: 'low',
              transactionId: tx.id,
              description: `First transaction between ${tx.sender} and ${tx.receiver} with high value`,
              detectedAt: now.toISOString(),
              recommendedAction: 'Monitor transaction closely for first-time partnership'
            })
          }
        })
        
        // 5. System-wide anomalies from metrics
        if (metrics?.consensus?.disputedTransactions > metrics?.consensus?.totalTransactions * 0.05) {
          detectedAnomalies.push({
            id: 'system-dispute-rate',
            type: 'frequency',
            severity: 'critical',
            transactionId: 'SYSTEM',
            description: `System dispute rate above 5% threshold`,
            detectedAt: now.toISOString(),
            recommendedAction: 'Review dispute patterns and investigate potential systemic issues'
          })
        }
        
        // Return unique anomalies (deduplicate by id)
        const uniqueAnomalies = Array.from(
          new Map(detectedAnomalies.map(a => [a.id, a])).values()
        )
        
        return uniqueAnomalies.slice(0, 5) // Limit to 5 most recent
      } catch (error) {
        console.error('Failed to detect anomalies:', error)
        return []
      }
    },
    enabled: !!api,
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