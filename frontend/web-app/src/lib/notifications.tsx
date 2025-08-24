import toast from 'react-hot-toast'
import { CheckCircle, Package, Truck, FileCheck, Shield, Award, HandshakeIcon, AlertTriangle } from 'lucide-react'

// Custom success notification with animations
const showSuccessNotification = (message: string, icon?: React.ReactNode) => {
  return toast.custom((t) => (
    <div
      className={`${
        t.visible ? 'animate-enter' : 'animate-leave'
      } max-w-md w-full bg-white shadow-2xl rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 transform transition-all duration-300`}
    >
      <div className="flex-1 w-0 p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0 pt-0.5">
            <div className="h-12 w-12 rounded-full bg-gradient-to-r from-green-400 to-emerald-500 flex items-center justify-center shadow-lg transform scale-110 animate-pulse">
              {icon || <CheckCircle className="h-6 w-6 text-white" />}
            </div>
          </div>
          <div className="ml-3 flex-1">
            <p className="text-sm font-medium text-gray-900">Success!</p>
            <p className="mt-1 text-sm text-gray-500">{message}</p>
          </div>
        </div>
      </div>
      <div className="flex border-l border-gray-200">
        <button
          onClick={() => toast.dismiss(t.id)}
          className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          Close
        </button>
      </div>
    </div>
  ), {
    duration: 4000,
  })
}

// Specific success notifications for different actions
export const notifications = {
  // Material Management
  materialCreated: (materialId: string) => 
    showSuccessNotification(
      `Material ${materialId} has been successfully created and added to inventory`,
      <Package className="h-6 w-6 text-white" />
    ),
  
  materialTransferred: (materialId: string, recipient: string) =>
    showSuccessNotification(
      `Material ${materialId} has been transferred to ${recipient}. Waiting for confirmation.`,
      <Truck className="h-6 w-6 text-white" />
    ),
  
  materialReceived: (materialId: string) =>
    showSuccessNotification(
      `Material ${materialId} receipt has been confirmed. Now available in your inventory.`,
      <CheckCircle className="h-6 w-6 text-white" />
    ),

  // Product Management
  productCreated: (productName: string) =>
    showSuccessNotification(
      `Product "${productName}" has been successfully created with unique blockchain ID`,
      <Award className="h-6 w-6 text-white" />
    ),
  
  materialAddedToProduct: (materialId: string, productId: string) =>
    showSuccessNotification(
      `Material ${materialId} has been successfully added to product`,
      <Package className="h-6 w-6 text-white" />
    ),
  
  qualityCheckpointAdded: (productId: string, status: string) =>
    showSuccessNotification(
      `Quality checkpoint ${status === 'passed' ? 'passed ✓' : 'recorded'} for product`,
      <FileCheck className="h-6 w-6 text-white" />
    ),
  
  productTransferred: (productId: string, recipient: string) =>
    showSuccessNotification(
      `Product successfully transferred to ${recipient}`,
      <Truck className="h-6 w-6 text-white" />
    ),

  // Dispute Management
  disputeCreated: (transactionId: string) =>
    showSuccessNotification(
      `Dispute has been raised for transaction ${transactionId}. Partner will be notified.`,
      <AlertTriangle className="h-6 w-6 text-white" />
    ),
  
  disputeResolved: (disputeId: string) =>
    showSuccessNotification(
      `Dispute ${disputeId} has been successfully resolved`,
      <HandshakeIcon className="h-6 w-6 text-white" />
    ),
  
  evidenceSubmitted: () =>
    showSuccessNotification(
      `Evidence has been submitted successfully. It will be reviewed shortly.`,
      <FileCheck className="h-6 w-6 text-white" />
    ),

  // Transaction Confirmations
  transactionConfirmed: (type: string) =>
    showSuccessNotification(
      `${type} transaction has been confirmed and recorded on blockchain`,
      <Shield className="h-6 w-6 text-white" />
    ),
  
  batchOperationCompleted: (count: number) =>
    showSuccessNotification(
      `Batch operation completed successfully. ${count} items processed.`,
      <CheckCircle className="h-6 w-6 text-white" />
    ),

  // General Success
  operationSuccess: (message: string) =>
    showSuccessNotification(message),
  
  // Quick success with default styling
  success: (message: string) => toast.success(message, {
    style: {
      borderRadius: '10px',
      background: '#10b981',
      color: '#fff',
      padding: '16px',
    },
  }),

  // Loading notification
  loading: (message: string) => toast.loading(message, {
    style: {
      borderRadius: '10px',
      background: '#6366f1',
      color: '#fff',
    },
  }),

  // Dismiss loading
  dismiss: (toastId: string) => toast.dismiss(toastId),
}

// Add required styles to your global CSS or component
export const notificationStyles = `
  @keyframes enter {
    from {
      transform: translateX(400px);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }

  @keyframes leave {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(400px);
      opacity: 0;
    }
  }

  .animate-enter {
    animation: enter 0.3s ease-out;
  }

  .animate-leave {
    animation: leave 0.3s ease-in forwards;
  }
`