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

const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t==='dark'){document.documentElement.classList.add('dark')}}catch(e){}})()`

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
