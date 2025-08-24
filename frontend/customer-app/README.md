# Luxury Customer App

Customer-facing web application for luxury product verification and ownership management.

## Features

- **QR Code Scanning**: Scan product QR codes to instantly verify authenticity
- **Product Verification**: View detailed product information and authenticity status
- **Ownership Claims**: Claim ownership using transfer codes from sellers
- **Ownership Transfer**: Generate transfer codes to sell or gift products
- **Birth Certificates**: View complete product history and manufacturing details
- **No Authentication Required**: Works with QR codes and transfer codes only

## Pages

- `/` - Home page with quick actions
- `/scan` - QR code scanner interface
- `/verify/[productId]` - Product verification and details
- `/ownership` - View owned products (by email)
- `/transfer/[productId]` - Generate transfer codes
- `/certificate/[productId]` - View birth certificate

## Technology Stack

- Next.js 14
- TypeScript
- Tailwind CSS
- QR Scanner (HTML5 camera API)

## Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start
```

## Environment Variables

- `NEXT_PUBLIC_CUSTOMER_GATEWAY_URL` - Customer gateway API URL (default: http://localhost:3010)
- `NEXT_PUBLIC_RETAILER_API_URL` - Retailer API URL for QR codes (default: http://localhost:4004)

## Docker Deployment

The app is configured to run in Docker as part of the main docker-compose setup:

```bash
docker-compose up customer-frontend
```

Accessible at http://localhost:3001