'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  CalendarDays,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Users,
  FileText,
  Tag,
  Bell,
  ChevronUp,
  Banknote,
  CalendarOff,
  Save,
  ListTodo,
  Building2,
  UserPlus,
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from '@/components/theme-toggle'

interface NavProps {
  profile: Profile
  isPlatformAdmin?: boolean
}

const navItems = (role: string, isPlatformAdmin?: boolean) => [
  { href: '/dashboard', label: 'Übersicht', icon: LayoutDashboard },
  { href: '/kalender', label: 'Kalender', icon: CalendarDays },
  { href: '/aufgaben', label: 'Aufgaben', icon: ListTodo },
  { href: '/verfuegbarkeit', label: 'Sperrzeiten', icon: CalendarOff },
  ...(role === 'admin' ? [
    { href: '/admin/berichte', label: 'Berichte', icon: FileText, section: 'Admin' },
    { href: '/admin/benutzer', label: 'Benutzer', icon: Users },
    { href: '/admin/taetigkeiten', label: 'Tätigkeiten', icon: Tag },
    { href: '/admin/aufgaben', label: 'Aufgaben', icon: ListTodo },
    { href: '/admin/zeiterfassung', label: 'Einsätze verwalten', icon: Clock },
    { href: '/admin/verfuegbarkeit', label: 'Sperrzeiten', icon: CalendarOff },
    { href: '/payroll', label: 'Abrechnung', icon: Banknote },
    { href: '/admin/sicherung', label: 'Datensicherung', icon: Save },
  ] : []),
  ...(isPlatformAdmin ? [
    { href: '/superadmin/mandanten', label: 'Mandanten', icon: Building2, section: 'Superadmin' },
    { href: '/superadmin/registrierung', label: 'Registrierung', icon: UserPlus },
  ] : []),
]

function NavLinks({ profile, isPlatformAdmin, onClick }: { profile: Profile; isPlatformAdmin?: boolean; onClick?: () => void }) {
  const pathname = usePathname()
  const items = navItems(profile.role, isPlatformAdmin)
  let lastSection = ''

  return (
    <nav className="space-y-0.5">
      {items.map((item) => {
        const Icon = item.icon
        const active = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
        const showSection = item.section && item.section !== lastSection
        if (item.section) lastSection = item.section

        return (
          <div key={item.href}>
            {showSection && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 px-3 pt-5 pb-1.5">
                {item.section}
              </p>
            )}
            <Link
              href={item.href}
              onClick={onClick}
              className={cn(
                'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150',
                active
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className={cn('h-4 w-4 shrink-0', active ? 'text-emerald-600' : 'text-gray-400')} />
              {item.label}
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500" />}
            </Link>
          </div>
        )
      })}
    </nav>
  )
}

export function Navigation({ profile, isPlatformAdmin }: NavProps) {
  const router = useRouter()
  const supabase = createClient()
  const [unreadCount, setUnreadCount] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    loadUnread()
    const channel = supabase
      .channel('nav-notifications')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${profile.id}`,
      }, () => loadUnread())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [profile.id])

  async function loadUnread() {
    const { count } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', profile.id)
      .eq('read', false)
    setUnreadCount(count ?? 0)
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  const initials = profile.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-60 bg-surface border-r border-gray-100 min-h-screen">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-100">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 shrink-0">
            <Users className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm tracking-tight">Assistenten-App</span>
        </div>

        {/* Nav */}
        <div className="flex-1 px-3 py-4">
          <NavLinks profile={profile} isPlatformAdmin={isPlatformAdmin} />
        </div>

        {/* User Footer */}
        <div className="border-t border-gray-100 p-3">
          <div className="flex justify-end mb-1">
            <ThemeToggle />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2.5 w-full rounded-lg px-2.5 py-2 hover:bg-gray-50 transition-colors text-left group">
              <Avatar className="h-7 w-7 shrink-0">
                <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate leading-tight">{profile.full_name}</p>
                <p className="text-xs text-gray-400 leading-tight">{profile.role === 'admin' ? 'Administrator' : 'Assistent'}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {unreadCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
                <ChevronUp className="h-3.5 w-3.5 text-gray-400 group-hover:text-gray-600 transition-colors" />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-52 mb-1">
              <DropdownMenuItem onClick={() => router.push('/benachrichtigungen')} className="gap-2">
                <Bell className="h-4 w-4 text-gray-400" />
                Benachrichtigungen
                {unreadCount > 0 && (
                  <Badge className="ml-auto bg-emerald-500 text-white text-[10px] px-1.5 py-0">
                    {unreadCount}
                  </Badge>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="gap-2 text-red-600 focus:text-red-600 focus:bg-red-50">
                <LogOut className="h-4 w-4" />
                Abmelden
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Mobile Header */}
      <header className="md:hidden sticky top-0 z-40 flex items-center justify-between bg-surface backdrop-blur border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 shrink-0">
            <Users className="h-4 w-4 text-white" />
          </div>
          <span className="font-semibold text-gray-900 text-sm">Assistenten-App</span>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle className="h-9 w-9" />
          <Link href="/benachrichtigungen" className="relative flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors" aria-label="Benachrichtigungen">
            <Bell className="h-5 w-5 text-gray-600" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </Link>
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger aria-label="Menü öffnen" className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-gray-100 transition-colors">
              <Menu className="h-5 w-5 text-gray-600" />
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 border-r border-gray-100 flex flex-col overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-5 border-b border-gray-100 shrink-0">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-600 shrink-0">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <span className="font-semibold text-gray-900 text-sm">Assistenten-App</span>
              </div>
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-gray-100 shrink-0">
                <Avatar className="h-8 w-8 shrink-0">
                  <AvatarFallback className="bg-emerald-100 text-emerald-700 text-sm font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium text-sm text-gray-900">{profile.full_name}</p>
                  <p className="text-xs text-gray-400">{profile.role === 'admin' ? 'Administrator' : 'Assistent'}</p>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
                <NavLinks profile={profile} isPlatformAdmin={isPlatformAdmin} onClick={() => setMobileOpen(false)} />
              </div>
              <div className="shrink-0 border-t border-gray-100 p-3 space-y-0.5">
                <Link
                  href="/benachrichtigungen"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Bell className="h-4 w-4 text-gray-400" />
                  Benachrichtigungen
                  {unreadCount > 0 && (
                    <span className="ml-auto flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[10px] font-bold text-white">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                </Link>
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  Abmelden
                </button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>
    </>
  )
}
