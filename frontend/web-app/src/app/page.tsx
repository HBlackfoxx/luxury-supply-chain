import Link from 'next/link'
import { Package, Users, ShieldCheck, QrCode } from 'lucide-react'

export default function HomePage() {
  const portals = [
    {
      title: 'B2B Portal',
      description: 'For suppliers, manufacturers, and retailers',
      icon: Package,
      href: '/b2b',
      color: 'bg-luxury-black',
      features: ['Shipment Tracking', 'Confirmation Management', 'Trust Scores'],
    },
    {
      title: 'Customer Portal',
      description: 'For product owners and buyers',
      icon: QrCode,
      href: '/customer',
      color: 'bg-luxury-gold',
      features: ['Ownership Claims', 'Product Transfers', 'Authenticity Verification'],
    },
    {
      title: 'Brand Admin',
      description: 'For brand administrators',
      icon: ShieldCheck,
      href: '/admin',
      color: 'bg-luxury-gray',
      features: ['Network Monitoring', 'Dispute Management', 'Analytics'],
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-luxury-gray-light to-white">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-luxury-black opacity-5"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="text-center">
            <h1 className="font-serif text-5xl md:text-7xl text-luxury-black mb-4">
              LuxeBags
            </h1>
            <p className="text-xl md:text-2xl text-luxury-gray mb-2">
              Luxury Supply Chain Management
            </p>
            <div className="inline-flex items-center space-x-2 text-luxury-gold">
              <ShieldCheck className="w-5 h-5" />
              <span className="text-sm font-medium">Blockchain-Verified Authenticity</span>
            </div>
          </div>
        </div>
      </div>

      {/* Portal Selection */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-24">
        <div className="text-center mb-12">
          <h2 className="font-serif text-3xl md:text-4xl text-luxury-black mb-4">
            Select Your Portal
          </h2>
          <p className="text-lg text-luxury-gray">
            Choose the appropriate interface based on your role
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {portals.map((portal) => {
            const Icon = portal.icon
            return (
              <Link
                key={portal.href}
                href={portal.href}
                className="group relative card-luxury p-8 hover:scale-105 transition-transform duration-300"
              >
                <div className={`absolute top-0 right-0 w-24 h-24 ${portal.color} opacity-10 rounded-full -mr-8 -mt-8`}></div>
                
                <div className="relative">
                  <div className={`inline-flex p-3 ${portal.color} text-white rounded-lg mb-4`}>
                    <Icon className="w-8 h-8" />
                  </div>
                  
                  <h3 className="font-serif text-2xl text-luxury-black mb-2">
                    {portal.title}
                  </h3>
                  
                  <p className="text-luxury-gray mb-4">
                    {portal.description}
                  </p>
                  
                  <ul className="space-y-2 mb-6">
                    {portal.features.map((feature) => (
                      <li key={feature} className="flex items-center text-sm text-luxury-gray">
                        <span className="w-1.5 h-1.5 bg-luxury-gold rounded-full mr-2"></span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  
                  <div className="flex items-center text-luxury-gold group-hover:text-luxury-gold-dark transition-colors">
                    <span className="font-medium">Enter Portal</span>
                    <svg className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Quick Verify Section */}
        <div className="mt-16 text-center">
          <div className="inline-flex items-center space-x-4 p-6 bg-white rounded-lg shadow-md">
            <QrCode className="w-8 h-8 text-luxury-gold" />
            <div className="text-left">
              <h3 className="font-medium text-luxury-black">Quick Verify</h3>
              <p className="text-sm text-luxury-gray">Scan a QR code to verify product authenticity</p>
            </div>
            <Link
              href="/verify"
              className="btn-luxury-outline text-sm"
            >
              Scan Now
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}