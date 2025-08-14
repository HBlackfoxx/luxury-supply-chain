'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Package, Upload, CheckCircle, AlertCircle, FileText, Download, Trash2, Play } from 'lucide-react'
import { useApi } from '@/hooks/use-api'
import { useAuthStore } from '@/stores/auth-store'
import Papa from 'papaparse'

interface BatchItem {
  transactionId: string
  action: 'confirm-sent' | 'confirm-received' | 'create-material' | 'create-product' | 'transfer'
  data?: any
  status?: 'pending' | 'processing' | 'success' | 'error'
  error?: string
}

interface ParsedRow {
  transactionId?: string
  action?: string
  [key: string]: any
}

export function BatchOperations() {
  const queryClient = useQueryClient()
  const api = useApi()
  const { user } = useAuthStore()
  const [batchItems, setBatchItems] = useState<BatchItem[]>([])
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [errors, setErrors] = useState<string[]>([])

  // Determine user role
  const isSupplier = user?.organization === 'italianleather'
  const isManufacturer = user?.organization === 'craftworkshop'
  const isRetailer = user?.organization === 'luxuryretail'

  const batchMutation = useMutation({
    mutationFn: async (items: BatchItem[]) => {
      if (!api) throw new Error('API not available')
      
      setUploadProgress(0)
      const results = []
      const totalItems = items.length
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        
        // Update item status
        setBatchItems(prev => prev.map((it, idx) => 
          idx === i ? { ...it, status: 'processing' } : it
        ))
        
        try {
          let result
          
          switch (item.action) {
            case 'confirm-sent':
              result = await api.post(`/api/consensus/transactions/${item.transactionId}/confirm-sent`, {
                evidence: item.data
              })
              break
              
            case 'confirm-received':
              result = await api.post(`/api/consensus/transactions/${item.transactionId}/confirm-received`, {
                evidence: item.data
              })
              break
              
            case 'create-material':
              if (isSupplier) {
                result = await api.post('/api/supply-chain/materials', item.data)
              }
              break
              
            case 'create-product':
              if (isManufacturer) {
                result = await api.post('/api/supply-chain/products', item.data)
              }
              break
              
            case 'transfer':
              result = await api.post('/api/supply-chain/transfer/initiate', item.data)
              break
          }
          
          results.push({ ...item, status: 'success' })
          setBatchItems(prev => prev.map((it, idx) => 
            idx === i ? { ...it, status: 'success' } : it
          ))
        } catch (error) {
          const errorMessage = (error as any)?.response?.data?.error || 'Failed to process'
          results.push({ ...item, status: 'error', error: errorMessage })
          setBatchItems(prev => prev.map((it, idx) => 
            idx === i ? { ...it, status: 'error', error: errorMessage } : it
          ))
        }
        
        setUploadProgress(Math.round(((i + 1) / totalItems) * 100))
      }
      
      return results
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['pending-transactions'] })
      queryClient.invalidateQueries({ queryKey: ['transaction-history'] })
      queryClient.invalidateQueries({ queryKey: ['products'] })
      queryClient.invalidateQueries({ queryKey: ['materials'] })
      
      setIsProcessing(false)
      
      // Count successes and errors
      const successCount = results.filter(r => r.status === 'success').length
      const errorCount = results.filter(r => r.status === 'error').length
      
      if (errorCount > 0) {
        setErrors([`Processed ${successCount} successfully, ${errorCount} failed`])
      }
    },
    onError: (error) => {
      setIsProcessing(false)
      setErrors([(error as Error).message])
    }
  })

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    setCsvFile(file)
    setErrors([])
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const items: BatchItem[] = []
        const parseErrors: string[] = []
        
        results.data.forEach((row: any, index: number) => {
          try {
            const action = row.action?.toLowerCase()
            
            if (!action) {
              parseErrors.push(`Row ${index + 2}: Missing action`)
              return
            }
            
            const item: BatchItem = {
              transactionId: row.transactionId || `BATCH-${Date.now()}-${index}`,
              action: action as any,
              data: {},
              status: 'pending'
            }
            
            // Parse data based on action type
            switch (action) {
              case 'confirm-sent':
              case 'confirm-received':
                item.data = {
                  evidence: {
                    tracking: row.trackingNumber,
                    notes: row.notes,
                    timestamp: new Date().toISOString()
                  }
                }
                break
                
              case 'create-material':
                item.data = {
                  materialId: row.materialId,
                  type: row.type,
                  source: row.source,
                  batch: row.batch,
                  quality: row.quality,
                  quantity: parseInt(row.quantity) || 1
                }
                break
                
              case 'create-product':
                item.data = {
                  brand: row.brand,
                  name: row.name,
                  type: row.type,
                  serialNumber: row.serialNumber,
                  materials: row.materials ? row.materials.split(';') : []
                }
                break
                
              case 'transfer':
                item.data = {
                  productId: row.productId,
                  toOrganization: row.toOrganization,
                  transferType: row.transferType || 'standard'
                }
                break
                
              default:
                parseErrors.push(`Row ${index + 2}: Unknown action "${action}"`)
                return
            }
            
            items.push(item)
          } catch (error) {
            parseErrors.push(`Row ${index + 2}: ${(error as Error).message}`)
          }
        })
        
        setBatchItems(items)
        if (parseErrors.length > 0) {
          setErrors(parseErrors)
        }
      },
      error: (error) => {
        setErrors([`CSV Parse Error: ${error.message}`])
      }
    })
  }

  const processBatch = () => {
    if (batchItems.length > 0) {
      setIsProcessing(true)
      setErrors([])
      batchMutation.mutate(batchItems)
    }
  }

  const clearBatch = () => {
    setBatchItems([])
    setCsvFile(null)
    setUploadProgress(0)
    setErrors([])
  }

  const downloadTemplate = () => {
    let csvContent = ''
    
    if (isSupplier) {
      csvContent = [
        'action,materialId,type,source,batch,quality,quantity',
        'create-material,LEATHER-001,leather,Tuscany Italy,BATCH-2024-001,premium,10',
        'create-material,FABRIC-001,fabric,Milan Italy,BATCH-2024-002,standard,20'
      ].join('\n')
    } else if (isManufacturer) {
      csvContent = [
        'action,brand,name,type,serialNumber,materials',
        'create-product,LuxeBags,Milano Handbag,handbag,SN-2024-001,LEATHER-001;FABRIC-001',
        'transfer,,,,,productId,toOrganization',
        'transfer,,,,,LUXEBAGS-HANDBAG-001,luxuryretail'
      ].join('\n')
    } else {
      csvContent = [
        'transactionId,action,trackingNumber,notes',
        'TX-123456,confirm-sent,TRACK123456,Shipped via express',
        'TX-123457,confirm-received,,Received in good condition',
        'transfer,productId,toOrganization',
        'transfer,LUXEBAGS-HANDBAG-001,customer'
      ].join('\n')
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `batch-template-${user?.organization}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />
      case 'processing':
        return <div className="w-4 h-4 border-2 border-luxury-gold border-t-transparent rounded-full animate-spin" />
      default:
        return <Package className="w-4 h-4 text-gray-400" />
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Batch Operations</h2>
            <p className="text-sm text-gray-600 mt-1">
              Process multiple operations at once using CSV upload
            </p>
          </div>
          <button
            onClick={downloadTemplate}
            className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Template
          </button>
        </div>

        {/* File Upload */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
            id="csv-upload"
            disabled={isProcessing}
          />
          <label
            htmlFor="csv-upload"
            className="cursor-pointer flex flex-col items-center"
          >
            <Upload className="w-12 h-12 text-gray-400 mb-3" />
            <span className="text-sm font-medium text-gray-900">
              {csvFile ? csvFile.name : 'Click to upload CSV file'}
            </span>
            <span className="text-xs text-gray-500 mt-1">
              or drag and drop
            </span>
          </label>
        </div>

        {/* Error Messages */}
        {errors.length > 0 && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <h4 className="text-sm font-medium text-red-800 mb-1">Errors found:</h4>
            <ul className="text-xs text-red-600 space-y-1">
              {errors.slice(0, 5).map((error, idx) => (
                <li key={idx}>• {error}</li>
              ))}
              {errors.length > 5 && (
                <li>... and {errors.length - 5} more errors</li>
              )}
            </ul>
          </div>
        )}

        {/* Action Buttons */}
        {batchItems.length > 0 && (
          <div className="mt-4 flex justify-between items-center">
            <span className="text-sm text-gray-600">
              {batchItems.length} operations ready to process
            </span>
            <div className="flex gap-2">
              <button
                onClick={clearBatch}
                disabled={isProcessing}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Trash2 className="w-4 h-4" />
                Clear
              </button>
              <button
                onClick={processBatch}
                disabled={isProcessing || batchItems.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-luxury-gold text-white rounded-lg hover:bg-luxury-dark disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Play className="w-4 h-4" />
                {isProcessing ? 'Processing...' : 'Process Batch'}
              </button>
            </div>
          </div>
        )}

        {/* Progress Bar */}
        {isProcessing && (
          <div className="mt-4">
            <div className="flex justify-between text-sm text-gray-600 mb-1">
              <span>Processing...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-luxury-gold h-2 rounded-full transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Batch Items Preview */}
      {batchItems.length > 0 && (
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold">Operations Preview</h3>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {batchItems.slice(0, 100).map((item, idx) => (
                  <tr key={idx} className={item.status === 'error' ? 'bg-red-50' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusIcon(item.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {item.action}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.transactionId}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {item.error ? (
                        <span className="text-red-600">{item.error}</span>
                      ) : (
                        <span className="text-gray-400">
                          {JSON.stringify(item.data).substring(0, 50)}...
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {batchItems.length > 100 && (
              <div className="px-6 py-3 bg-gray-50 text-center text-sm text-gray-500">
                ... and {batchItems.length - 100} more items
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}