'use client'

import { Zap, Info } from 'lucide-react'
import { useState } from 'react'

interface AutomationIndicatorProps {
  trustScore: number
  partnerName: string
}

export function AutomationIndicator({ trustScore, partnerName }: AutomationIndicatorProps) {
  const [showTooltip, setShowTooltip] = useState(false)

  const getAutomationLevel = () => {
    if (trustScore >= 95) return { level: 'Full', color: 'text-green-600', bg: 'bg-green-100' }
    if (trustScore >= 85) return { level: 'High', color: 'text-blue-600', bg: 'bg-blue-100' }
    if (trustScore >= 70) return { level: 'Partial', color: 'text-yellow-600', bg: 'bg-yellow-100' }
    return { level: 'Manual', color: 'text-gray-600', bg: 'bg-gray-100' }
  }

  const automation = getAutomationLevel()

  return (
    <div className="relative inline-flex items-center">
      <div
        className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${automation.bg} ${automation.color}`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <Zap className="w-3 h-3" />
        <span>{automation.level} Auto</span>
      </div>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-lg z-10">
          <div className="flex items-start space-x-2">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium mb-1">Progressive Automation</p>
              <p className="text-gray-300">
                {trustScore >= 95 && `Transactions with ${partnerName} are automatically approved due to excellent trust history.`}
                {trustScore >= 85 && trustScore < 95 && `Most routine transactions with ${partnerName} are auto-approved. Large or unusual transactions require confirmation.`}
                {trustScore >= 70 && trustScore < 85 && `Small transactions with ${partnerName} may be auto-approved. Most require manual confirmation.`}
                {trustScore < 70 && `All transactions with ${partnerName} require manual confirmation due to limited trust history.`}
              </p>
            </div>
          </div>
          <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 translate-y-full">
            <div className="w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  )
}