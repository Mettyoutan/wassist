import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Warung Dashboard',
  description: 'Dashboard UMKM',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body>
        <div className="mobile-wrapper">
          {children}
        </div>
      </body>
    </html>
  )
}