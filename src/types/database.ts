type Rel = {
  foreignKeyName: string
  columns: string[]
  isOneToOne: boolean
  referencedRelation: string
  referencedColumns: string[]
}

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string
          role: 'admin' | 'assistant'
          active: boolean
          created_at: string
          color: string
          ical_token: string | null
          rv_pflicht: boolean
          kv_pflicht: boolean
        }
        Insert: {
          id: string
          email: string
          full_name: string
          role: 'admin' | 'assistant'
          active?: boolean
          color?: string
          ical_token?: string | null
          rv_pflicht?: boolean
          kv_pflicht?: boolean
        }
        Update: {
          email?: string
          full_name?: string
          role?: 'admin' | 'assistant'
          active?: boolean
          color?: string
          ical_token?: string | null
          rv_pflicht?: boolean
          kv_pflicht?: boolean
        }
        Relationships: Rel[]
      }
      activities: {
        Row: {
          id: string
          name: string
          active: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          active?: boolean
          sort_order?: number
        }
        Update: {
          name?: string
          active?: boolean
          sort_order?: number
        }
        Relationships: Rel[]
      }
      time_entries: {
        Row: {
          id: string
          assistant_id: string
          date: string
          start_time: string
          end_time: string
          activity_id: string | null
          description: string | null
          month_status: 'draft' | 'confirmed' | 'sent'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          assistant_id: string
          date: string
          start_time: string
          end_time: string
          activity_id?: string | null
          description?: string | null
          month_status?: 'draft' | 'confirmed' | 'sent'
        }
        Update: {
          assistant_id?: string
          date?: string
          start_time?: string
          end_time?: string
          activity_id?: string | null
          description?: string | null
          month_status?: 'draft' | 'confirmed' | 'sent'
        }
        Relationships: Rel[]
      }
      monthly_reports: {
        Row: {
          id: string
          assistant_id: string
          year: number
          month: number
          status: 'pending' | 'confirmed' | 'sent'
          confirmed_at: string | null
          sent_at: string | null
          admin_viewed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          assistant_id: string
          year: number
          month: number
          status?: 'pending' | 'confirmed' | 'sent'
          confirmed_at?: string | null
          sent_at?: string | null
          admin_viewed_at?: string | null
        }
        Update: {
          status?: 'pending' | 'confirmed' | 'sent'
          confirmed_at?: string | null
          sent_at?: string | null
          admin_viewed_at?: string | null
        }
        Relationships: Rel[]
      }
      payroll_settings: {
        Row: {
          id: string
          hourly_rate: number
          currency: string
          updated_at: string
          updated_by: string | null
          payroll_enabled: boolean
          payroll_count_mode: 'slots' | 'entries' | 'both'
          minijob_mode: boolean
          bezirk_mode: boolean
          uv_rate: number
          employer_name: string
          employer_address: string
          employer_tax_number: string
          monthly_budget: number
          account_fee: number
          weekly_hours_target: number
          mj_kv_ag: number
          mj_rv_ag: number
          mj_pauschsteuer: number
          mj_u2: number
          mj_insolvenzgeld: number
          mj_rv_an: number
        }
        Insert: {
          id?: string
          hourly_rate: number
          currency?: string
          updated_by?: string | null
          payroll_enabled?: boolean
          payroll_count_mode?: 'slots' | 'entries' | 'both'
          minijob_mode?: boolean
          bezirk_mode?: boolean
          uv_rate?: number
          employer_name?: string
          employer_address?: string
          employer_tax_number?: string
          monthly_budget?: number
          account_fee?: number
          weekly_hours_target?: number
          mj_kv_ag?: number
          mj_rv_ag?: number
          mj_pauschsteuer?: number
          mj_u2?: number
          mj_insolvenzgeld?: number
          mj_rv_an?: number
        }
        Update: {
          hourly_rate?: number
          currency?: string
          updated_by?: string | null
          payroll_enabled?: boolean
          payroll_count_mode?: 'slots' | 'entries' | 'both'
          minijob_mode?: boolean
          bezirk_mode?: boolean
          uv_rate?: number
          employer_name?: string
          employer_address?: string
          employer_tax_number?: string
          monthly_budget?: number
          account_fee?: number
          weekly_hours_target?: number
          mj_kv_ag?: number
          mj_rv_ag?: number
          mj_pauschsteuer?: number
          mj_u2?: number
          mj_insolvenzgeld?: number
          mj_rv_an?: number
        }
        Relationships: Rel[]
      }
      payroll_runs: {
        Row: {
          id: string
          year: number
          month: number
          assistant_id: string
          total_minutes: number
          hourly_rate: number
          total_pay: number
          email_sent_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          year: number
          month: number
          assistant_id: string
          total_minutes: number
          hourly_rate: number
          total_pay: number
          email_sent_at?: string | null
        }
        Update: {
          total_minutes?: number
          hourly_rate?: number
          total_pay?: number
          email_sent_at?: string | null
        }
        Relationships: Rel[]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          title: string
          message: string
          type: 'info' | 'warning' | 'success' | 'error'
          read: boolean
          related_type: string | null
          related_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          message: string
          type?: 'info' | 'warning' | 'success' | 'error'
          read?: boolean
          related_type?: string | null
          related_id?: string | null
        }
        Update: { read?: boolean }
        Relationships: Rel[]
      }
      calendar_slots: {
        Row: {
          id: string
          date: string
          start_time: string
          end_time: string
          title: string
          description: string | null
          assigned_to: string | null
          created_by: string
          status: 'open' | 'assigned' | 'cancelled'
          created_at: string
        }
        Insert: {
          id?: string
          date: string
          start_time: string
          end_time: string
          title: string
          description?: string | null
          assigned_to?: string | null
          created_by: string
          status?: 'open' | 'assigned' | 'cancelled'
        }
        Update: {
          date?: string
          start_time?: string
          end_time?: string
          title?: string
          description?: string | null
          assigned_to?: string | null
          status?: 'open' | 'assigned' | 'cancelled'
        }
        Relationships: Rel[]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}

export type Profile = Database['public']['Tables']['profiles']['Row']
export type TimeEntry = Database['public']['Tables']['time_entries']['Row']
export type Activity = Database['public']['Tables']['activities']['Row']
export type MonthlyReport = Database['public']['Tables']['monthly_reports']['Row']
export type PayrollSettings = Database['public']['Tables']['payroll_settings']['Row']
export type PayrollRun = Database['public']['Tables']['payroll_runs']['Row']
