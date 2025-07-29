'use client'

import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { AlertCircle, Info } from 'lucide-react'

export function EmergencyBanner() {
  const { data: emergencyStatus } = useQuery({
    queryKey: ['emergency-status'],
    queryFn: async () => {
      const { data } = await axios.get('/api/consensus/emergency/status')
      return data
    },
    refetchInterval: 30000 // Check every 30 seconds
  })

  if (!emergencyStatus?.isActive) return null

  return (
    <div className="fixed top-16 left-0 right-0 z-40 bg-red-600 text-white">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <div>
              <p className="font-medium">Emergency Stop Active</p>
              <p className="text-sm text-red-100">
                {emergencyStatus.reason || 'System is temporarily paused. Transactions are on hold.'}
              </p>
            </div>
          </div>
          
          {emergencyStatus.estimatedResolution && (
            <div className="flex items-center space-x-2 text-sm">
              <Info className="w-4 h-4" />
              <span>Est. resolution: {new Date(emergencyStatus.estimatedResolution).toLocaleTimeString()}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}