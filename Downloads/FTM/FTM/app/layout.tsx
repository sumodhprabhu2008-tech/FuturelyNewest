import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'NextStep — AI Academic Companion',
  description: 'NextStep helps high school students track grades, plan assignments, and prepare for college.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0B0D12" />
      </head>
      <body>{children}</body>
    </html>
  )
}
