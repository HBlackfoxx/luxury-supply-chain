'use client'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { TrendingUp, TrendingDown, Minus, Users, AlertCircle } from 'lucide-react'

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
  const { data: trustScores, isLoading } = useQuery<TrustScore[]>({
    queryKey: ['trust-scores'],
    queryFn: async () => {
      // In production, get from auth
      const orgId = 'luxebags'
      const { data } = await axios.get(`/api/consensus/trust/${orgId}/history`)
      
      // Transform the response to match TrustScore interface
      if (!data?.relationships) return []
      
      return data.relationships.map((rel: any) => ({
        partnerId: rel.partnerId,
        partnerName: rel.partnerName || rel.partnerId,
        score: rel.trustScore || 0,
        trend: rel.trend || 'stable',
        transactions: rel.totalTransactions || 0,
        disputes: rel.disputeCount || 0,
        lastInteraction: rel.lastInteraction || new Date().toISOString()
      }))
    },
  })

  const { data: myScore } = useQuery({
    queryKey: ['my-trust-score'],
    queryFn: async () => {
      // In production, get from auth
      const orgId = 'luxebags'
      const { data } = await axios.get(`/api/consensus/trust/${orgId}`)
      return data
    },
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

        {myScore?.score < 80 && (
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