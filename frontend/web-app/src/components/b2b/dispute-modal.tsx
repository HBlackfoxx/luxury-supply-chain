'use client'

import { useState } from 'react'
import { X, AlertTriangle, Upload, FileText } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useApi } from '@/hooks/use-api'

interface DisputeModalProps {
  isOpen: boolean
  onClose: () => void
  transactionId: string
  transactionDetails: {
    partner: string
    itemDescription: string
    value: number
  }
}

export function DisputeModal({ isOpen, onClose, transactionId, transactionDetails }: DisputeModalProps) {
  const queryClient = useQueryClient()
  const api = useApi()
  const [disputeType, setDisputeType] = useState<string>('NOT_RECEIVED')
  const [reason, setReason] = useState('')
  const [evidence, setEvidence] = useState<File[]>([])

  const createDisputeMutation = useMutation({
    mutationFn: async () => {
      if (!api) throw new Error('API not available')
      
      const formData = new FormData()
      formData.append('type', disputeType)
      formData.append('reason', reason)
      evidence.forEach(file => formData.append('evidence', file))

      const { data } = await api.post(
        `/api/consensus/transactions/${transactionId}/dispute`,
        {
          type: disputeType,
          reason,
          initialEvidence: {
            description: reason,
            files: evidence.map(f => f.name)
          }
        }
      )
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['disputes'] })
      onClose()
    }
  })

  if (!isOpen) return null

  const disputeTypes = [
    { value: 'NOT_RECEIVED', label: 'Goods Not Received' },
    { value: 'DAMAGED', label: 'Goods Damaged' },
    { value: 'WRONG_ITEM', label: 'Wrong Item Received' },
    { value: 'QUALITY_ISSUE', label: 'Quality Issues' },
    { value: 'QUANTITY_MISMATCH', label: 'Quantity Mismatch' },
    { value: 'TIMEOUT', label: 'Partner Not Responding' }
  ]

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
        
        <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Create Dispute</h3>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="mb-4 p-3 bg-amber-50 rounded-md">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-medium">Before creating a dispute</p>
                <p className="mt-1">Try contacting {transactionDetails.partner} directly. Disputes may affect trust scores.</p>
              </div>
            </div>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault()
            createDisputeMutation.mutate()
          }}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transaction
                </label>
                <p className="text-sm text-gray-600">{transactionDetails.itemDescription}</p>
                <p className="text-xs text-gray-500">Value: ${transactionDetails.value.toLocaleString()}</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Dispute Type
                </label>
                <select
                  value={disputeType}
                  onChange={(e) => setDisputeType(e.target.value)}
                  className="w-full border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
                  required
                >
                  {disputeTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  className="w-full border-gray-300 rounded-md focus:ring-luxury-gold focus:border-luxury-gold"
                  placeholder="Provide details about the issue..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Evidence (Optional)
                </label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 border-dashed rounded-md">
                  <div className="space-y-1 text-center">
                    <Upload className="mx-auto h-12 w-12 text-gray-400" />
                    <div className="flex text-sm text-gray-600">
                      <label htmlFor="file-upload" className="relative cursor-pointer rounded-md font-medium text-luxury-gold hover:text-luxury-gold-dark">
                        <span>Upload files</span>
                        <input
                          id="file-upload"
                          name="file-upload"
                          type="file"
                          className="sr-only"
                          multiple
                          onChange={(e) => {
                            if (e.target.files) {
                              setEvidence(Array.from(e.target.files))
                            }
                          }}
                        />
                      </label>
                      <p className="pl-1">or drag and drop</p>
                    </div>
                    <p className="text-xs text-gray-500">
                      Images, PDFs up to 10MB
                    </p>
                  </div>
                </div>
                {evidence.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {evidence.map((file, idx) => (
                      <div key={idx} className="flex items-center text-sm text-gray-600">
                        <FileText className="w-4 h-4 mr-1" />
                        {file.name}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createDisputeMutation.isPending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {createDisputeMutation.isPending ? 'Creating...' : 'Create Dispute'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}