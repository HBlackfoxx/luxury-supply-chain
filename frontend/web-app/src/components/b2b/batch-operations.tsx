'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { Package, Upload, CheckCircle, AlertCircle, FileText } from 'lucide-react'

interface BatchItem {
  transactionId: string
  action: 'confirm-sent' | 'confirm-received'
  evidence?: any
}

export function BatchOperations() {
  const queryClient = useQueryClient()
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const batchMutation = useMutation({
    mutationFn: async (items: BatchItem[]) => {
      const { data } = await axios.post('/api/consensus/transactions/batch', {
        operations: items,
      })
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transaction-history'] })
      setBatchItems([])
      setCsvFile(null)
    },
  })

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setCsvFile(file)
      // In a real app, parse CSV and populate batchItems
      // For demo, just create some sample items
      setBatchItems([
        {
          transactionId: 'TX001',
          action: 'confirm-sent',
          evidence: { tracking: 'TRACK123' },
        },
        {
          transactionId: 'TX002',
          action: 'confirm-received',
          evidence: { notes: 'Received in good condition' },
        },
      ])
    }
  }

  const processBatch = () => {
    if (batchItems.length > 0) {
      setIsProcessing(true)
      batchMutation.mutate(batchItems)
    }
  }

  const downloadTemplate = () => {
    // In a real app, this would download a CSV template
    const csvContent = 'transactionId,action,trackingNumber,notes\nTX001,confirm-sent,TRACK123,\nTX002,confirm-received,,Received in good condition'
    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'batch-operations-template.csv'
    a.click()
  }

  return (
    <div className="space-y-6">
      {/* Upload Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Batch Operations</h3>
        
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload a CSV file to process multiple confirmations at once. This is useful for confirming
            large shipments or processing end-of-day operations.
          </p>

          <div className="flex items-center space-x-4">
            <button
              onClick={downloadTemplate}
              className="flex items-center space-x-2 text-luxury-gold hover:text-luxury-gold-dark"
            >
              <FileText className="w-4 h-4" />
              <span className="text-sm font-medium">Download Template</span>
            </button>
          </div>

          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8">
            <input
              type="file"
              accept=".csv"
              onChange={handleFileUpload}
              className="hidden"
              id="csv-upload"
            />
            <label
              htmlFor="csv-upload"
              className="cursor-pointer flex flex-col items-center"
            >
              <Upload className="w-12 h-12 text-gray-400 mb-3" />
              <span className="text-sm font-medium text-gray-900">
                Click to upload CSV file
              </span>
              <span className="text-xs text-gray-500 mt-1">
                or drag and drop
              </span>
            </label>
          </div>

          {csvFile && (
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
              <div className="flex items-center space-x-2">
                <FileText className="w-5 h-5 text-gray-400" />
                <span className="text-sm text-gray-900">{csvFile.name}</span>
              </div>
              <button
                onClick={() => {
                  setCsvFile(null)
                  setBatchItems([])
                }}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Remove
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Preview Section */}
      {batchItems.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Preview ({batchItems.length} operations)
            </h3>
          </div>

          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Transaction ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Evidence
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {batchItems.map((item, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.transactionId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        item.action === 'confirm-sent'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {item.action === 'confirm-sent' ? 'Confirm Sent' : 'Confirm Received'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {JSON.stringify(item.evidence || {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <AlertCircle className="w-4 h-4" />
              <span>Please review before processing</span>
            </div>
            
            <button
              onClick={processBatch}
              disabled={isProcessing || batchMutation.isPending}
              className="flex items-center space-x-2 px-4 py-2 bg-luxury-gold text-luxury-black rounded-md hover:bg-luxury-gold-dark transition-colors disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>Process Batch</span>
            </button>
          </div>
        </div>
      )}

      {/* Success Message */}
      {batchMutation.isSuccess && (
        <div className="bg-green-50 border border-green-200 rounded-md p-4">
          <div className="flex items-center">
            <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
            <p className="text-sm text-green-800">
              Batch operations completed successfully!
            </p>
          </div>
        </div>
      )}
    </div>
  )
}