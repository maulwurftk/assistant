import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Assistenten-App',
  description: 'Lohnabrechnung für Assistenten',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Assistenten-App',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  )
}
