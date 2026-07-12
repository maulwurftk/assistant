export type Role = 'admin' | 'assistant'

export interface Profile {
  id: string
  tenant_id?: string
  email: string
  full_name: string
  role: Role
  active: boolean
  color?: string
  ical_token?: string | null
  iban?: string | null
  rv_pflicht?: boolean
  kv_pflicht?: boolean
  minijob_limit?: number | null
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
  is_private: boolean
  created_at: string
  updated_at: string
  activity?: Pick<Activity, 'name'> | null
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
  is_private: boolean
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

export type TodoRecurrence = 'per_shift' | 'daily' | 'weekly'

export interface TodoTemplate {
  id: string
  tenant_id?: string
  title: string
  description: string | null
  activity_id: string | null
  recurrence: TodoRecurrence
  weekday: number | null
  assignee_id: string | null
  active: boolean
  sort_order: number
  created_at: string
  activity?: Pick<Activity, 'name'> | null
  assignee?: Pick<Profile, 'full_name'> | null
}

export interface TodoCheck {
  id: string
  tenant_id?: string
  template_id: string
  slot_id: string | null
  check_date: string
  done_by: string
  done_at: string
  note: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  template?: Pick<TodoTemplate, 'title'> | null
  done_by_profile?: Pick<Profile, 'full_name'> | null
  confirmed_by_profile?: Pick<Profile, 'full_name'> | null
}

export type TodoStatus = 'open' | 'done' | 'cancelled'

export interface Todo {
  id: string
  tenant_id?: string
  title: string
  description: string | null
  activity_id: string | null
  assignee_id: string | null
  due_date: string | null
  status: TodoStatus
  done_by: string | null
  done_at: string | null
  note: string | null
  confirmed_by: string | null
  confirmed_at: string | null
  created_by: string
  created_at: string
  activity?: Pick<Activity, 'name'> | null
  assignee?: Pick<Profile, 'full_name'> | null
}
