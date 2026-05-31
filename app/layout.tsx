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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Shadows+Into+Light&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
          {children}
      </body>
    </html>
  )
}