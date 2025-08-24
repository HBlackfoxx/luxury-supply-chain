'use client'

import { Toaster } from 'react-hot-toast'

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      reverseOrder={false}
      gutter={12}
      toastOptions={{
        duration: 5000,
        style: {
          background: '#fff',
          color: '#363636',
          padding: '16px',
          borderRadius: '12px',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.1)',
          maxWidth: '420px',
        },
        success: {
          duration: 4000,
          style: {
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            color: 'white',
          },
          iconTheme: {
            primary: 'white',
            secondary: '#667eea',
          },
        },
        error: {
          duration: 5000,
          style: {
            background: '#ef4444',
            color: 'white',
          },
          iconTheme: {
            primary: 'white',
            secondary: '#ef4444',
          },
        },
        loading: {
          style: {
            background: '#f59e0b',
            color: 'white',
          },
        },
      }}
    />
  )
}