'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Leaf } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      toast.error('Anmeldung fehlgeschlagen: ' + error.message)
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left panel — branding */}
      <div className="hidden lg:flex flex-col justify-between bg-emerald-600 p-12 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
            <Leaf className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-lg">Assistenten-App</span>
        </div>
        <div>
          <blockquote className="text-2xl font-light leading-relaxed text-white/90">
            "Einfache Zeiterfassung, klare Übersicht — damit Sie sich auf das Wesentliche konzentrieren können."
          </blockquote>
        </div>
        <div className="text-white/50 text-sm">© {new Date().getFullYear()} Assistenten-App</div>
      </div>

      {/* Right panel — login form */}
      <div className="flex items-center justify-center p-8 bg-gray-50">
        <div className="w-full max-w-sm space-y-8">
          {/* Mobile logo */}
          <div className="flex items-center gap-2.5 lg:hidden">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600">
              <Leaf className="h-4 w-4 text-white" />
            </div>
            <span className="font-semibold text-gray-900">Assistenten-App</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold text-gray-900">Willkommen zurück</h1>
            <p className="text-gray-500 mt-1 text-sm">Bitte melden Sie sich an, um fortzufahren.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700">
                E-Mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="name@beispiel.de"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-10 bg-white border-gray-200 focus-visible:ring-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700">
                Passwort
              </Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-10 bg-white border-gray-200 focus-visible:ring-emerald-500"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
              disabled={loading}
            >
              {loading ? 'Anmelden…' : 'Anmelden'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
