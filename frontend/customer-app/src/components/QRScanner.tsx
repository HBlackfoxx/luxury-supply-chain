'use client'

import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'

interface QRScannerProps {
  onScan: (data: string) => void
  onError?: (error: string) => void
  onClose?: () => void
}

export default function QRScanner({ onScan, onError, onClose }: QRScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scanning, setScanning] = useState(false)
  const [hasPermission, setHasPermission] = useState<boolean | null>(null)
  const streamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    startScanning()
    return () => {
      stopScanning()
    }
  }, [])

  const startScanning = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      })
      
      streamRef.current = stream
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        setHasPermission(true)
        setScanning(true)
        
        // Start QR detection
        detectQRCode()
      }
    } catch (err) {
      console.error('Camera access error:', err)
      setHasPermission(false)
      onError?.('Camera access denied')
    }
  }

  const stopScanning = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    setScanning(false)
  }

  const detectQRCode = async () => {
    if (!videoRef.current || !canvasRef.current || !scanning) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const context = canvas.getContext('2d')

    if (!context) return

    // Set canvas dimensions
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480

    const scan = () => {
      if (!scanning) return

      // Draw video frame to canvas
      context.drawImage(video, 0, 0, canvas.width, canvas.height)

      // Get image data
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height)

      // Try browser's built-in BarcodeDetector first (Chrome/Edge)
      if ('BarcodeDetector' in window) {
        try {
          // @ts-ignore
          const barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] })
          
          barcodeDetector.detect(canvas)
            .then((barcodes: any[]) => {
              if (barcodes.length > 0) {
                const qrData = barcodes[0].rawValue
                stopScanning()
                onScan(qrData)
              } else {
                requestAnimationFrame(scan)
              }
            })
            .catch((err: any) => {
              console.error('BarcodeDetector error, falling back to jsQR:', err)
              // Fall back to jsQR
              scanWithJsQR()
            })
        } catch (err) {
          // Fall back to jsQR
          scanWithJsQR()
        }
      } else {
        // Use jsQR library as fallback
        scanWithJsQR()
      }
      
      // jsQR fallback function
      async function scanWithJsQR() {
        try {
          const jsQR = (await import('jsqr')).default
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert',
          })
          
          if (code) {
            stopScanning()
            onScan(code.data)
          } else {
            requestAnimationFrame(scan)
          }
        } catch (err) {
          console.error('jsQR error:', err)
          onError?.('QR scanning failed')
          stopScanning()
        }
      }
    }

    // Wait for video to be ready
    video.addEventListener('loadedmetadata', () => {
      scan()
    })
  }

  if (hasPermission === false) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 max-w-sm w-full">
          <h3 className="text-lg font-semibold mb-2">Camera Access Required</h3>
          <p className="text-gray-600 mb-4">
            Please allow camera access to scan QR codes
          </p>
          <button
            onClick={() => {
              onClose?.()
            }}
            className="w-full py-2 bg-luxury-gold text-white rounded-md hover:bg-luxury-dark"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black z-50">
      {/* Close button */}
      <button
        onClick={() => {
          stopScanning()
          onClose?.()
        }}
        className="absolute top-4 right-4 z-10 p-2 bg-white rounded-full shadow-lg"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Camera view */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
      />

      {/* Hidden canvas for QR detection */}
      <canvas
        ref={canvasRef}
        className="hidden"
      />

      {/* Scanning overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative">
          <div className="w-64 h-64 border-4 border-white rounded-lg">
            <div className="absolute inset-0 border-2 border-luxury-gold rounded-lg animate-pulse" />
          </div>
          <p className="text-white text-center mt-4">
            {scanning ? 'Scanning for QR code...' : 'Initializing camera...'}
          </p>
        </div>
      </div>
    </div>
  )
}