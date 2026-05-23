export type Role = 'admin' | 'assistant'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  active: boolean
  color?: string
  ical_token?: string
  created_at: string
}

export interface Activity {
  id: string
  name: string
  active: boolean
  sort_order: number
  created_at: string
}

export type MonthStatus = 'draft' | 'confirmed' | 'sent'

export interface TimeEntry {
  id: string
  assistant_id: string
  date: string
  start_time: string
  end_time: string
  activity_id: string | null
  description: string | null
  month_status: MonthStatus
  created_at: string
  updated_at: string
  activity?: Activity
  assistant?: Profile
}

export type SlotStatus = 'open' | 'pending' | 'assigned' | 'cancelled'

export interface CalendarSlot {
  id: string
  date: string
  start_time: string
  end_time: string
  title: string
  description: string | null
  assigned_to: string | null
  created_by: string
  status: SlotStatus
  created_at: string
  assigned_profile?: Profile
  pending_request_by?: string | null
}

export type ReportStatus = 'pending' | 'confirmed' | 'sent'

export interface MonthlyReport {
  id: string
  assistant_id: string
  year: number
  month: number
  status: ReportStatus
  confirmed_at: string | null
  sent_at: string | null
  admin_viewed_at: string | null
  created_at: string
  assistant?: Profile
}

export type NotificationType = 'info' | 'warning' | 'success' | 'error'

export interface Notification {
  id: string
  user_id: string
  title: string
  message: string
  type: NotificationType
  read: boolean
  related_type: string | null
  related_id: string | null
  created_at: string
}
