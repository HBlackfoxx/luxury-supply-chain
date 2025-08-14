'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, TrendingDown, Minus, Users, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/stores/auth-store'
import { useApi } from '@/hooks/use-api'

interface TrustScore {
  partnerId: string
  partnerName: string
  score: number
  trend: 'up' | 'down' | 'stable'
  transactions: number
  disputes: number
  lastInteraction: string
}

export function TrustScoreDashboard() {
  const { user } = useAuthStore()
  const api = useApi()
  
  const { data: trustScores, isLoading } = useQuery<TrustScore[]>({
    queryKey: ['trust-scores', user?.organization],
    queryFn: async () => {
      if (!user?.organization || !api) return []
      
      try {
        // Get transaction history to calculate trust scores
        const { data } = await api.get(`/api/consensus/transactions/history/${user.organization}`)
        
        // Calculate partner trust scores from transaction history
        const partnerMap: { [key: string]: TrustScore } = {}
        
        data.forEach((tx: any) => {
          const partner = tx.sender === user.organization ? tx.receiver : tx.sender
          if (partner === user.organization) return // Skip self
          
          if (!partnerMap[partner]) {
            partnerMap[partner] = {
              partnerId: partner,
              partnerName: partner.charAt(0).toUpperCase() + partner.slice(1),
              score: 85, // Base score
              trend: 'stable' as const,
              transactions: 0,
              disputes: 0,
              lastInteraction: tx.updatedAt || tx.createdAt
            }
          }
          
          partnerMap[partner].transactions++
          
          // Adjust score based on transaction outcome
          if (tx.state === 'VALIDATED') {
            partnerMap[partner].score = Math.min(100, partnerMap[partner].score + 1)
            partnerMap[partner].trend = 'up'
          } else if (tx.state === 'DISPUTED') {
            partnerMap[partner].disputes++
            partnerMap[partner].score = Math.max(0, partnerMap[partner].score - 5)
            partnerMap[partner].trend = 'down'
          }
          
          // Update last interaction
          const txDate = tx.updatedAt || tx.createdAt
          if (new Date(txDate) > new Date(partnerMap[partner].lastInteraction)) {
            partnerMap[partner].lastInteraction = txDate
          }
        })
        
        return Object.values(partnerMap)
      } catch (error) {
        console.error('Failed to fetch trust scores:', error)
        return []
      }
    },
    enabled: !!user?.organization && !!api,
  })

  const { data: myScore } = useQuery({
    queryKey: ['my-trust-score', user?.organization],
    queryFn: async () => {
      if (!user?.organization || !api) return null
      
      try {
        // Calculate overall trust score from partner scores
        if (!trustScores || trustScores.length === 0) {
          return { score: 85, trend: 'stable', totalTransactions: 0, rank: null } // Default for new organizations
        }
        
        const avgScore = Math.round(
          trustScores.reduce((sum, partner) => sum + partner.score, 0) / trustScores.length
        )
        
        const totalTransactions = trustScores.reduce((sum, partner) => sum + partner.transactions, 0)
        
        // Determine trend based on recent partner trends
        const upCount = trustScores.filter(p => p.trend === 'up').length
        const downCount = trustScores.filter(p => p.trend === 'down').length
        
        let trend: 'up' | 'down' | 'stable' = 'stable'
        if (upCount > downCount) trend = 'up'
        else if (downCount > upCount) trend = 'down'
        
        // Calculate rank based on score
        let rank = null
        if (avgScore >= 95) rank = 1
        else if (avgScore >= 90) rank = 2
        else if (avgScore >= 85) rank = 3
        else if (avgScore >= 80) rank = 4
        else rank = 5
        
        return { score: avgScore, trend, totalTransactions, rank }
      } catch (error) {
        return { score: 85, trend: 'stable', totalTransactions: 0, rank: null }
      }
    },
    enabled: !!user?.organization && !!api && !!trustScores,
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-luxury-gold"></div>
      </div>
    )
  }

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600'
    if (score >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'up':
        return <TrendingUp className="w-4 h-4 text-green-500" />
      case 'down':
        return <TrendingDown className="w-4 h-4 text-red-500" />
      default:
        return <Minus className="w-4 h-4 text-gray-400" />
    }
  }

  return (
    <div className="space-y-6">
      {/* My Trust Score */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Your Trust Score</h3>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline space-x-2">
              <span className={`text-4xl font-bold ${getScoreColor(myScore?.score || 0)}`}>
                {myScore?.score || 0}%
              </span>
              {getTrendIcon(myScore?.trend || 'stable')}
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Based on {myScore?.totalTransactions || 0} transactions
            </p>
          </div>
          
          <div className="text-right">
            <p className="text-sm text-gray-500">Network Rank</p>
            <p className="text-2xl font-semibold text-gray-900">#{myScore?.rank || 'N/A'}</p>
          </div>
        </div>

        {myScore && myScore.score < 80 && (
          <div className="mt-4 p-3 bg-amber-50 rounded-md flex items-start space-x-2">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Improve your trust score</p>
              <p className="mt-1">Confirm transactions promptly and resolve disputes quickly to improve your score.</p>
            </div>
          </div>
        )}
      </div>

      {/* Partner Trust Scores */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Partner Trust Scores</h3>
        </div>
        
        <div className="divide-y divide-gray-200">
          {trustScores?.map((partner) => (
            <div key={partner.partnerId} className="p-6 hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Users className="w-5 h-5 text-gray-600" />
                  </div>
                  
                  <div>
                    <h4 className="text-sm font-medium text-gray-900">{partner.partnerName}</h4>
                    <div className="mt-1 flex items-center space-x-4 text-xs text-gray-500">
                      <span>{partner.transactions} transactions</span>
                      <span>•</span>
                      <span>{partner.disputes} disputes</span>
                      <span>•</span>
                      <span>Last: {new Date(partner.lastInteraction).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className={`text-2xl font-bold ${getScoreColor(partner.score)}`}>
                    {partner.score}%
                  </span>
                  {getTrendIcon(partner.trend)}
                </div>
              </div>
            </div>
          ))}

          {(!trustScores || trustScores.length === 0) && (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No partner relationships yet</p>
              <p className="text-sm text-gray-500 mt-1">Trust scores will appear as you transact with partners</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}