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
      organizations: {
        Row: {
          id: string
          name: string
          slug: string
          status: 'active' | 'suspended' | 'deleted'
          plan: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          status?: 'active' | 'suspended' | 'deleted'
          plan?: string
        }
        Update: {
          name?: string
          slug?: string
          status?: 'active' | 'suspended' | 'deleted'
          plan?: string
        }
        Relationships: Rel[]
      }
      profiles: {
        Row: {
          id: string
          tenant_id: string
          email: string
          full_name: string
          role: 'admin' | 'assistant'
          active: boolean
          created_at: string
          color: string
          ical_token: string | null
          rv_pflicht: boolean
          kv_pflicht: boolean
          iban: string | null
        }
        Insert: {
          id: string
          tenant_id?: string
          email: string
          full_name: string
          role: 'admin' | 'assistant'
          active?: boolean
          color?: string
          ical_token?: string | null
          rv_pflicht?: boolean
          kv_pflicht?: boolean
          iban?: string | null
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
          iban?: string | null
        }
        Relationships: Rel[]
      }
      activities: {
        Row: {
          id: string
          tenant_id: string
          name: string
          active: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
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
          tenant_id: string
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
          tenant_id?: string
          assistant_id: string
          date: string
          start_time: string
          end_time: string
          activity_id?: string | null
          description?: string | null
          month_status?: 'draft' | 'confirmed' | 'sent'
          updated_at?: string
        }
        Update: {
          assistant_id?: string
          date?: string
          start_time?: string
          end_time?: string
          activity_id?: string | null
          description?: string | null
          month_status?: 'draft' | 'confirmed' | 'sent'
          updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'time_entries_assistant_id_fkey', columns: ['assistant_id'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
          { foreignKeyName: 'time_entries_activity_id_fkey', columns: ['activity_id'], isOneToOne: false, referencedRelation: 'activities', referencedColumns: ['id'] },
        ]
      }
      monthly_reports: {
        Row: {
          id: string
          tenant_id: string
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
          tenant_id?: string
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
        Relationships: [
          { foreignKeyName: 'monthly_reports_assistant_id_fkey', columns: ['assistant_id'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
        ]
      }
      payroll_settings: {
        Row: {
          id: string
          tenant_id: string
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
          weekly_template: unknown | null
        }
        Insert: {
          id?: string
          tenant_id?: string
          hourly_rate: number
          currency?: string
          weekly_template?: unknown | null
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
          weekly_template?: unknown | null
        }
        Relationships: Rel[]
      }
      payroll_runs: {
        Row: {
          id: string
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id: string
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
          tenant_id?: string
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
          tenant_id: string
          date: string
          start_time: string
          end_time: string
          title: string
          description: string | null
          assigned_to: string | null
          created_by: string
          status: 'open' | 'pending' | 'assigned' | 'cancelled'
          pending_request_by: string | null
          reminder_sent_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          date: string
          start_time: string
          end_time: string
          title: string
          description?: string | null
          assigned_to?: string | null
          created_by: string
          status?: 'open' | 'pending' | 'assigned' | 'cancelled'
          pending_request_by?: string | null
          reminder_sent_at?: string | null
        }
        Update: {
          date?: string
          start_time?: string
          end_time?: string
          title?: string
          description?: string | null
          assigned_to?: string | null
          status?: 'open' | 'pending' | 'assigned' | 'cancelled'
          pending_request_by?: string | null
          reminder_sent_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'calendar_slots_assigned_to_fkey', columns: ['assigned_to'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
          { foreignKeyName: 'calendar_slots_created_by_fkey', columns: ['created_by'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
          { foreignKeyName: 'calendar_slots_pending_request_by_fkey', columns: ['pending_request_by'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
        ]
      }
      account_ledger: {
        Row: {
          id: string
          tenant_id: string
          booking_date: string
          direction: 'in' | 'out'
          category: string
          amount: number
          description: string | null
          status: 'pending' | 'confirmed'
          source: 'manual' | 'auto'
          dedup_key: string | null
          created_by: string | null
          created_at: string
          confirmed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string
          booking_date: string
          direction: 'in' | 'out'
          category: string
          amount: number
          description?: string | null
          status?: 'pending' | 'confirmed'
          source?: 'manual' | 'auto'
          dedup_key?: string | null
          created_by?: string | null
          confirmed_at?: string | null
        }
        Update: {
          booking_date?: string
          direction?: 'in' | 'out'
          category?: string
          amount?: number
          description?: string | null
          status?: 'pending' | 'confirmed'
          source?: 'manual' | 'auto'
          dedup_key?: string | null
          created_by?: string | null
          confirmed_at?: string | null
        }
        Relationships: Rel[]
      }
      push_subscriptions: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          endpoint: string
          subscription: unknown
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          user_id: string
          endpoint: string
          subscription: unknown
        }
        Update: {
          user_id?: string
          endpoint?: string
          subscription?: unknown
        }
        Relationships: Rel[]
      }
      assistant_unavailability: {
        Row: {
          id: string
          tenant_id: string
          assistant_id: string
          type: 'single' | 'recurring'
          date: string | null
          day_of_week: number | null
          all_day: boolean
          start_time: string | null
          end_time: string | null
          valid_from: string | null
          valid_until: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          assistant_id: string
          type: 'single' | 'recurring'
          date?: string | null
          day_of_week?: number | null
          all_day?: boolean
          start_time?: string | null
          end_time?: string | null
          valid_from?: string | null
          valid_until?: string | null
          note?: string | null
        }
        Update: {
          type?: 'single' | 'recurring'
          date?: string | null
          day_of_week?: number | null
          all_day?: boolean
          start_time?: string | null
          end_time?: string | null
          valid_from?: string | null
          valid_until?: string | null
          note?: string | null
        }
        Relationships: [
          { foreignKeyName: 'assistant_unavailability_assistant_id_fkey', columns: ['assistant_id'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
        ]
      }
      platform_admins: {
        Row: {
          user_id: string
          created_at: string
        }
        Insert: {
          user_id: string
        }
        Update: Record<string, never>
        Relationships: Rel[]
      }
      platform_settings: {
        Row: {
          key: string
          value: unknown
          updated_at: string
        }
        Insert: {
          key: string
          value: unknown
        }
        Update: {
          value?: unknown
          updated_at?: string
        }
        Relationships: Rel[]
      }
      registration_codes: {
        Row: {
          id: string
          code: string
          max_uses: number
          used_count: number
          expires_at: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          max_uses?: number
          used_count?: number
          expires_at?: string | null
          note?: string | null
        }
        Update: {
          code?: string
          max_uses?: number
          used_count?: number
          expires_at?: string | null
          note?: string | null
        }
        Relationships: Rel[]
      }
      todo_templates: {
        Row: {
          id: string
          tenant_id: string
          title: string
          description: string | null
          activity_id: string | null
          recurrence: 'per_shift' | 'daily' | 'weekly'
          weekday: number | null
          assignee_id: string | null
          active: boolean
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          title: string
          description?: string | null
          activity_id?: string | null
          recurrence?: 'per_shift' | 'daily' | 'weekly'
          weekday?: number | null
          assignee_id?: string | null
          active?: boolean
          sort_order?: number
        }
        Update: {
          title?: string
          description?: string | null
          activity_id?: string | null
          recurrence?: 'per_shift' | 'daily' | 'weekly'
          weekday?: number | null
          assignee_id?: string | null
          active?: boolean
          sort_order?: number
        }
        Relationships: [
          { foreignKeyName: 'todo_templates_activity_id_fkey', columns: ['activity_id'], isOneToOne: false, referencedRelation: 'activities', referencedColumns: ['id'] },
          { foreignKeyName: 'todo_templates_assignee_id_fkey', columns: ['assignee_id'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
        ]
      }
      todo_checks: {
        Row: {
          id: string
          tenant_id: string
          template_id: string
          slot_id: string | null
          check_date: string
          done_by: string
          done_at: string
          note: string | null
          confirmed_by: string | null
          confirmed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id?: string
          template_id: string
          slot_id?: string | null
          check_date?: string
          done_by: string
          note?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
        }
        Update: {
          note?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'todo_checks_template_id_fkey', columns: ['template_id'], isOneToOne: false, referencedRelation: 'todo_templates', referencedColumns: ['id'] },
          { foreignKeyName: 'todo_checks_slot_id_fkey', columns: ['slot_id'], isOneToOne: false, referencedRelation: 'calendar_slots', referencedColumns: ['id'] },
          { foreignKeyName: 'todo_checks_done_by_fkey', columns: ['done_by'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
          { foreignKeyName: 'todo_checks_confirmed_by_fkey', columns: ['confirmed_by'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
        ]
      }
      todos: {
        Row: {
          id: string
          tenant_id: string
          title: string
          description: string | null
          activity_id: string | null
          assignee_id: string | null
          due_date: string | null
          status: 'open' | 'done' | 'cancelled'
          done_by: string | null
          done_at: string | null
          note: string | null
          confirmed_by: string | null
          confirmed_at: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id?: string
          title: string
          description?: string | null
          activity_id?: string | null
          assignee_id?: string | null
          due_date?: string | null
          status?: 'open' | 'done' | 'cancelled'
          done_by?: string | null
          done_at?: string | null
          note?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
          created_by: string
        }
        Update: {
          title?: string
          description?: string | null
          activity_id?: string | null
          assignee_id?: string | null
          due_date?: string | null
          status?: 'open' | 'done' | 'cancelled'
          done_by?: string | null
          done_at?: string | null
          note?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
        }
        Relationships: [
          { foreignKeyName: 'todos_activity_id_fkey', columns: ['activity_id'], isOneToOne: false, referencedRelation: 'activities', referencedColumns: ['id'] },
          { foreignKeyName: 'todos_assignee_id_fkey', columns: ['assignee_id'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
          { foreignKeyName: 'todos_done_by_fkey', columns: ['done_by'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
          { foreignKeyName: 'todos_confirmed_by_fkey', columns: ['confirmed_by'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
          { foreignKeyName: 'todos_created_by_fkey', columns: ['created_by'], isOneToOne: false, referencedRelation: 'profiles', referencedColumns: ['id'] },
        ]
      }
    }
    Views: Record<string, never>
    Functions: {
      current_tenant: {
        Args: Record<string, never>
        Returns: string | null
      }
      provision_tenant: {
        Args: { p_org_name: string; p_slug: string; p_code?: string | null }
        Returns: string
      }
      import_backup: {
        Args: { p_payload: unknown; p_mode: 'merge' | 'replace' }
        Returns: unknown
      }
      complete_todo: {
        Args: { p_id: string; p_note?: string | null }
        Returns: unknown
      }
    }
  }
}

export type Organization = Database['public']['Tables']['organizations']['Row']

export type Profile = Database['public']['Tables']['profiles']['Row']
export type TimeEntry = Database['public']['Tables']['time_entries']['Row']
export type Activity = Database['public']['Tables']['activities']['Row']
export type MonthlyReport = Database['public']['Tables']['monthly_reports']['Row']
export type PayrollSettings = Database['public']['Tables']['payroll_settings']['Row']
export type PayrollRun = Database['public']['Tables']['payroll_runs']['Row']
export type TodoTemplate = Database['public']['Tables']['todo_templates']['Row']
export type TodoCheck = Database['public']['Tables']['todo_checks']['Row']
export type Todo = Database['public']['Tables']['todos']['Row']
