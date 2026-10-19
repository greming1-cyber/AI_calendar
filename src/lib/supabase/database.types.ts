export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      budgets: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          id: string
          month: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          id?: string
          month: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          id?: string
          month?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tx_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      event_categories: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          color: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          all_day: boolean
          category_id: string | null
          created_at: string
          deleted_at: string | null
          end_at: string | null
          exdates: string[]
          google_calendar_id: string | null
          google_dirty: boolean
          google_etag: string | null
          google_event_id: string | null
          google_updated_at: string | null
          id: string
          location: string
          memo: string
          original_date: string | null
          recurrence_parent_id: string | null
          reminder_minutes: number | null
          rrule: string | null
          source: string
          start_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          all_day?: boolean
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          end_at?: string | null
          exdates?: string[]
          google_calendar_id?: string | null
          google_dirty?: boolean
          google_etag?: string | null
          google_event_id?: string | null
          google_updated_at?: string | null
          id?: string
          location?: string
          memo?: string
          original_date?: string | null
          recurrence_parent_id?: string | null
          reminder_minutes?: number | null
          rrule?: string | null
          source?: string
          start_at: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          all_day?: boolean
          category_id?: string | null
          created_at?: string
          deleted_at?: string | null
          end_at?: string | null
          exdates?: string[]
          google_calendar_id?: string | null
          google_dirty?: boolean
          google_etag?: string | null
          google_event_id?: string | null
          google_updated_at?: string | null
          id?: string
          location?: string
          memo?: string
          original_date?: string | null
          recurrence_parent_id?: string | null
          reminder_minutes?: number | null
          rrule?: string | null
          source?: string
          start_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_google_calendar_id_fkey"
            columns: ["google_calendar_id"]
            isOneToOne: false
            referencedRelation: "google_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      google_accounts: {
        Row: {
          access_token_expires_at: string | null
          created_at: string
          google_email: string
          id: string
          last_error: string | null
          last_synced_at: string | null
          refresh_token_secret_id: string | null
          status: string
          sync_started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_expires_at?: string | null
          created_at?: string
          google_email: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_secret_id?: string | null
          status?: string
          sync_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          access_token_expires_at?: string | null
          created_at?: string
          google_email?: string
          id?: string
          last_error?: string | null
          last_synced_at?: string | null
          refresh_token_secret_id?: string | null
          status?: string
          sync_started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      google_calendars: {
        Row: {
          access_role: string
          calendar_id: string
          color: string | null
          created_at: string
          enabled: boolean
          google_account_id: string
          id: string
          is_primary: boolean
          last_synced_at: string | null
          name: string
          sync_direction: string
          sync_token: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_role?: string
          calendar_id: string
          color?: string | null
          created_at?: string
          enabled?: boolean
          google_account_id: string
          id?: string
          is_primary?: boolean
          last_synced_at?: string | null
          name: string
          sync_direction?: string
          sync_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          access_role?: string
          calendar_id?: string
          color?: string | null
          created_at?: string
          enabled?: boolean
          google_account_id?: string
          id?: string
          is_primary?: boolean
          last_synced_at?: string | null
          name?: string
          sync_direction?: string
          sync_token?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendars_google_account_id_fkey"
            columns: ["google_account_id"]
            isOneToOne: false
            referencedRelation: "google_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_audit_logs: {
        Row: {
          args: Json | null
          created_at: string
          id: string
          result_summary: string | null
          status: string
          token_id: string | null
          tool: string
          updated_at: string
          user_id: string
        }
        Insert: {
          args?: Json | null
          created_at?: string
          id?: string
          result_summary?: string | null
          status?: string
          token_id?: string | null
          tool: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          args?: Json | null
          created_at?: string
          id?: string
          result_summary?: string | null
          status?: string
          token_id?: string | null
          tool?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mcp_audit_logs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "mcp_tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_tokens: {
        Row: {
          created_at: string
          id: string
          last_used_at: string | null
          name: string
          revoked_at: string | null
          scopes: string[]
          token_hash: string
          token_prefix: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash: string
          token_prefix: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          scopes?: string[]
          token_hash?: string
          token_prefix?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          read_at: string | null
          ref_id: string | null
          ref_type: string | null
          send_at: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          kind: string
          read_at?: string | null
          ref_id?: string | null
          ref_type?: string | null
          send_at?: string
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          read_at?: string | null
          ref_id?: string | null
          ref_type?: string | null
          send_at?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      payment_methods: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          default_view: string
          id: string
          name: string
          theme: string
          timezone: string
          updated_at: string
          user_id: string
          weather_location: Json | null
          week_start: number
        }
        Insert: {
          created_at?: string
          default_view?: string
          id?: string
          name?: string
          theme?: string
          timezone?: string
          updated_at?: string
          user_id: string
          weather_location?: Json | null
          week_start?: number
        }
        Update: {
          created_at?: string
          default_view?: string
          id?: string
          name?: string
          theme?: string
          timezone?: string
          updated_at?: string
          user_id?: string
          weather_location?: Json | null
          week_start?: number
        }
        Relationships: []
      }
      projects: {
        Row: {
          archived: boolean
          color: string | null
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          archived?: boolean
          color?: string | null
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          archived?: boolean
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      recurring_transactions: {
        Row: {
          active: boolean
          amount: number
          category_id: string | null
          created_at: string
          day_of_month: number
          id: string
          memo: string
          payment_method_id: string | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          active?: boolean
          amount: number
          category_id?: string | null
          created_at?: string
          day_of_month: number
          id?: string
          memo?: string
          payment_method_id?: string | null
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          active?: boolean
          amount?: number
          category_id?: string | null
          created_at?: string
          day_of_month?: number
          id?: string
          memo?: string
          payment_method_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "recurring_transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tx_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recurring_transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_conflicts: {
        Row: {
          created_at: string
          event_id: string | null
          id: string
          local_snapshot: Json | null
          remote_snapshot: Json | null
          resolved_with: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id?: string | null
          id?: string
          local_snapshot?: Json | null
          remote_snapshot?: Json | null
          resolved_with?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          event_id?: string | null
          id?: string
          local_snapshot?: Json | null
          remote_snapshot?: Json | null
          resolved_with?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_conflicts_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      todos: {
        Row: {
          completed_at: string | null
          created_at: string
          due_at: string | null
          due_date: string | null
          event_id: string | null
          id: string
          memo: string
          parent_id: string | null
          priority: number
          project_id: string | null
          rrule: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          memo?: string
          parent_id?: string | null
          priority?: number
          project_id?: string | null
          rrule?: string | null
          title: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          due_at?: string | null
          due_date?: string | null
          event_id?: string | null
          id?: string
          memo?: string
          parent_id?: string | null
          priority?: number
          project_id?: string | null
          rrule?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "todos_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "todos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "todos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category_id: string | null
          created_at: string
          event_id: string | null
          id: string
          memo: string
          occurred_on: string
          payment_method_id: string | null
          recurring_id: string | null
          type: string
          updated_at: string
          user_id: string
          via_mcp: boolean
        }
        Insert: {
          amount: number
          category_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          memo?: string
          occurred_on: string
          payment_method_id?: string | null
          recurring_id?: string | null
          type: string
          updated_at?: string
          user_id?: string
          via_mcp?: boolean
        }
        Update: {
          amount?: number
          category_id?: string | null
          created_at?: string
          event_id?: string | null
          id?: string
          memo?: string
          occurred_on?: string
          payment_method_id?: string | null
          recurring_id?: string | null
          type?: string
          updated_at?: string
          user_id?: string
          via_mcp?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tx_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurring_id_fkey"
            columns: ["recurring_id"]
            isOneToOne: false
            referencedRelation: "recurring_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      tx_categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          sort_order: number
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          type: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      weather_cache: {
        Row: {
          base_time: string
          created_at: string
          expires_at: string
          grid_key: string
          id: string
          kind: string
          payload: Json
          provider: string
          updated_at: string
        }
        Insert: {
          base_time: string
          created_at?: string
          expires_at: string
          grid_key: string
          id?: string
          kind: string
          payload: Json
          provider: string
          updated_at?: string
        }
        Update: {
          base_time?: string
          created_at?: string
          expires_at?: string
          grid_key?: string
          id?: string
          kind?: string
          payload?: Json
          provider?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_todo: { Args: { p_done?: boolean; p_id: string }; Returns: Json }
      get_google_refresh_token: {
        Args: { p_account_id: string }
        Returns: string
      }
      invoke_gcal_sync: { Args: never; Returns: undefined }
      seed_demo: { Args: { uid: string }; Returns: undefined }
      set_gcal_cron_config: {
        Args: { p_secret: string; p_url: string }
        Returns: undefined
      }
      set_google_refresh_token: {
        Args: { p_account_id: string; p_token: string }
        Returns: undefined
      }
      todo_next_due: {
        Args: { p_after: string; p_rrule: string }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
