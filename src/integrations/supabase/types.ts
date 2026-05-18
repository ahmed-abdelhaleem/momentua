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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ace_insights: {
        Row: {
          content: string
          created_at: string
          data: Json
          id: string
          kind: string
          title: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          title?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ace_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          role: Database["public"]["Enums"]["message_role"]
          session_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["message_role"]
          session_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["message_role"]
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ace_sessions: {
        Row: {
          ended_at: string | null
          id: string
          started_at: string
          summary: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          ended_at?: string | null
          id?: string
          started_at?: string
          summary?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          ended_at?: string | null
          id?: string
          started_at?: string
          summary?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          balance: number | null
          connection_id: string
          created_at: string
          currency: string
          external_id: string
          id: string
          name: string | null
          type: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number | null
          connection_id: string
          created_at?: string
          currency?: string
          external_id: string
          id?: string
          name?: string | null
          type?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number | null
          connection_id?: string
          created_at?: string
          currency?: string
          external_id?: string
          id?: string
          name?: string | null
          type?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "bank_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_connections: {
        Row: {
          consent_expires_at: string | null
          created_at: string
          credentials_id: string | null
          id: string
          institution_id: string | null
          institution_name: string | null
          last_error: string | null
          last_sync_at: string | null
          provider: string
          reference: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_expires_at?: string | null
          created_at?: string
          credentials_id?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          reference?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_expires_at?: string | null
          created_at?: string
          credentials_id?: string | null
          id?: string
          institution_id?: string | null
          institution_name?: string | null
          last_error?: string | null
          last_sync_at?: string | null
          provider?: string
          reference?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bank_transactions: {
        Row: {
          account_id: string
          amount: number
          booked_date: string
          category: string | null
          created_at: string
          currency: string
          description: string | null
          external_id: string
          id: string
          merchant: string | null
          raw: Json
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          booked_date: string
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id: string
          id?: string
          merchant?: string | null
          raw?: Json
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          booked_date?: string
          category?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          external_id?: string
          id?: string
          merchant?: string | null
          raw?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      brain_dumps: {
        Row: {
          category: Database["public"]["Enums"]["dump_category"] | null
          content: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["dump_category"] | null
          content: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          category?: Database["public"]["Enums"]["dump_category"] | null
          content?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      cook_sessions: {
        Row: {
          cook_for_date: string
          created_at: string
          follow_up_at: string | null
          id: string
          meal: Json
          portions: number
          post_cook: Json
          shop_overrides: Json
          slots: Json
          style: string
          total_cost_sek: number | null
          user_id: string
        }
        Insert: {
          cook_for_date: string
          created_at?: string
          follow_up_at?: string | null
          id?: string
          meal?: Json
          portions: number
          post_cook?: Json
          shop_overrides?: Json
          slots?: Json
          style: string
          total_cost_sek?: number | null
          user_id: string
        }
        Update: {
          cook_for_date?: string
          created_at?: string
          follow_up_at?: string | null
          id?: string
          meal?: Json
          portions?: number
          post_cook?: Json
          shop_overrides?: Json
          slots?: Json
          style?: string
          total_cost_sek?: number | null
          user_id?: string
        }
        Relationships: []
      }
      cook_step_progress: {
        Row: {
          completed_at: string
          cook_session_id: string
          id: string
          step_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string
          cook_session_id: string
          id?: string
          step_id: string
          user_id: string
        }
        Update: {
          completed_at?: string
          cook_session_id?: string
          id?: string
          step_id?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_deal_sources: {
        Row: {
          created_at: string
          id: string
          label: string | null
          last_error: string | null
          last_scraped_at: string | null
          last_status: string
          store: string | null
          updated_at: string
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          last_error?: string | null
          last_scraped_at?: string | null
          last_status?: string
          store?: string | null
          updated_at?: string
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          last_error?: string | null
          last_scraped_at?: string | null
          last_status?: string
          store?: string | null
          updated_at?: string
          url?: string
          user_id?: string
        }
        Relationships: []
      }
      custom_deals: {
        Row: {
          category: string | null
          discount: string | null
          id: string
          image_url: string | null
          item: string
          raw_text: string | null
          scraped_at: string
          source_id: string
          type_key: string | null
          user_id: string
        }
        Insert: {
          category?: string | null
          discount?: string | null
          id?: string
          image_url?: string | null
          item: string
          raw_text?: string | null
          scraped_at?: string
          source_id: string
          type_key?: string | null
          user_id: string
        }
        Update: {
          category?: string | null
          discount?: string | null
          id?: string
          image_url?: string | null
          item?: string
          raw_text?: string | null
          scraped_at?: string
          source_id?: string
          type_key?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "custom_deals_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "custom_deal_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_checkins: {
        Row: {
          checkin_date: string
          created_at: string
          energy: number | null
          evening_notes: string | null
          evening_status:
            | Database["public"]["Enums"]["completion_status"]
            | null
          id: string
          morning_commitment: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          checkin_date: string
          created_at?: string
          energy?: number | null
          evening_notes?: string | null
          evening_status?:
            | Database["public"]["Enums"]["completion_status"]
            | null
          id?: string
          morning_commitment?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          checkin_date?: string
          created_at?: string
          energy?: number | null
          evening_notes?: string | null
          evening_status?:
            | Database["public"]["Enums"]["completion_status"]
            | null
          id?: string
          morning_commitment?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      favorite_stores: {
        Row: {
          created_at: string
          id: string
          store_name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          store_name: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          store_name?: string
          user_id?: string
        }
        Relationships: []
      }
      fcm_tokens: {
        Row: {
          created_at: string
          device_label: string | null
          id: string
          last_used_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_used_at?: string
          platform?: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_label?: string | null
          id?: string
          last_used_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      foundation_readiness: {
        Row: {
          created_at: string
          data: Json
          id: string
          mental: number
          physical: number
          regulation: number
          session_id: string | null
          social: number
          total: number
          user_id: string
          week_start: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          mental?: number
          physical?: number
          regulation?: number
          session_id?: string | null
          social?: number
          total?: number
          user_id: string
          week_start: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          mental?: number
          physical?: number
          regulation?: number
          session_id?: string | null
          social?: number
          total?: number
          user_id?: string
          week_start?: string
        }
        Relationships: []
      }
      foundation_reflections: {
        Row: {
          content: string
          created_at: string
          data: Json
          id: string
          month_start: string
          session_id: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          data?: Json
          id?: string
          month_start: string
          session_id?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          data?: Json
          id?: string
          month_start?: string
          session_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      foundation_sessions: {
        Row: {
          commitment_want: string
          commitment_why: string
          created_at: string
          deactivation_reason: string | null
          deactivation_requested_at: string | null
          duration_months: number
          ended_at: string | null
          ends_at: string
          id: string
          stake_bump_sek: number
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          commitment_want?: string
          commitment_why?: string
          created_at?: string
          deactivation_reason?: string | null
          deactivation_requested_at?: string | null
          duration_months?: number
          ended_at?: string | null
          ends_at: string
          id?: string
          stake_bump_sek?: number
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          commitment_want?: string
          commitment_why?: string
          created_at?: string
          deactivation_reason?: string | null
          deactivation_requested_at?: string | null
          duration_months?: number
          ended_at?: string | null
          ends_at?: string
          id?: string
          stake_bump_sek?: number
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      foundation_triggers: {
        Row: {
          created_at: string
          id: string
          intensity: number | null
          redirect_chosen: string | null
          redirect_completed: boolean
          resolution: string | null
          resolved_at: string | null
          session_id: string | null
          underneath: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          intensity?: number | null
          redirect_chosen?: string | null
          redirect_completed?: boolean
          resolution?: string | null
          resolved_at?: string | null
          session_id?: string | null
          underneath?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          intensity?: number | null
          redirect_chosen?: string | null
          redirect_completed?: boolean
          resolution?: string | null
          resolved_at?: string | null
          session_id?: string | null
          underneath?: string | null
          user_id?: string
        }
        Relationships: []
      }
      health_entries: {
        Row: {
          confirmed_at: string | null
          created_at: string
          entry_date: string
          id: string
          points_awarded: number
          sleep_hours: number
          steps: number
          updated_at: string
          user_id: string
          workouts: Json
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          entry_date: string
          id?: string
          points_awarded?: number
          sleep_hours?: number
          steps?: number
          updated_at?: string
          user_id: string
          workouts?: Json
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          entry_date?: string
          id?: string
          points_awarded?: number
          sleep_hours?: number
          steps?: number
          updated_at?: string
          user_id?: string
          workouts?: Json
        }
        Relationships: []
      }
      insight_notifications_state: {
        Row: {
          last_digest_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          last_digest_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          last_digest_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      insights: {
        Row: {
          baseline_value: number | null
          body: string
          commit_deadline_at: string | null
          committed_at: string | null
          created_at: string
          delta_pct: number | null
          id: string
          last_reminder_at: string | null
          metric_key: string | null
          section: string
          source_data: Json
          status: string
          suggested_action: string | null
          title: string
          updated_at: string
          user_id: string
          verification_value: number | null
          verified_at: string | null
        }
        Insert: {
          baseline_value?: number | null
          body: string
          commit_deadline_at?: string | null
          committed_at?: string | null
          created_at?: string
          delta_pct?: number | null
          id?: string
          last_reminder_at?: string | null
          metric_key?: string | null
          section: string
          source_data?: Json
          status?: string
          suggested_action?: string | null
          title: string
          updated_at?: string
          user_id: string
          verification_value?: number | null
          verified_at?: string | null
        }
        Update: {
          baseline_value?: number | null
          body?: string
          commit_deadline_at?: string | null
          committed_at?: string | null
          created_at?: string
          delta_pct?: number | null
          id?: string
          last_reminder_at?: string | null
          metric_key?: string | null
          section?: string
          source_data?: Json
          status?: string
          suggested_action?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          verification_value?: number | null
          verified_at?: string | null
        }
        Relationships: []
      }
      meal_pantry: {
        Row: {
          created_at: string
          id: string
          item: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item?: string
          user_id?: string
        }
        Relationships: []
      }
      meal_plans: {
        Row: {
          ate_as_planned: string | null
          breakfast: Json | null
          checked_items: Json
          created_at: string
          dinner: Json | null
          energy: string | null
          id: string
          lunch: Json | null
          plan_date: string
          shop_destination: string | null
          shop_status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          ate_as_planned?: string | null
          breakfast?: Json | null
          checked_items?: Json
          created_at?: string
          dinner?: Json | null
          energy?: string | null
          id?: string
          lunch?: Json | null
          plan_date: string
          shop_destination?: string | null
          shop_status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          ate_as_planned?: string | null
          breakfast?: Json | null
          checked_items?: Json
          created_at?: string
          dinner?: Json | null
          energy?: string | null
          id?: string
          lunch?: Json | null
          plan_date?: string
          shop_destination?: string | null
          shop_status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      memory_notes: {
        Row: {
          category: string | null
          content: string
          created_at: string
          id: string
          pinned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string
          id?: string
          pinned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string
          id?: string
          pinned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          body: string
          dismissed_at: string | null
          id: string
          kind: string
          meta: Json
          opened_at: string | null
          sent_at: string
          title: string
          user_id: string
        }
        Insert: {
          body: string
          dismissed_at?: string | null
          id?: string
          kind: string
          meta?: Json
          opened_at?: string | null
          sent_at?: string
          title: string
          user_id: string
        }
        Update: {
          body?: string
          dismissed_at?: string | null
          id?: string
          kind?: string
          meta?: Json
          opened_at?: string | null
          sent_at?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          evening_hour: number
          evening_log: boolean
          insights_digest: boolean
          insights_new: boolean
          insights_reminder: boolean
          insights_verify: boolean
          max_per_day: number
          morning_checkin: boolean
          morning_hour: number
          plan_nudge: boolean
          quiet_end: number
          quiet_start: number
          surprise_window: boolean
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          evening_hour?: number
          evening_log?: boolean
          insights_digest?: boolean
          insights_new?: boolean
          insights_reminder?: boolean
          insights_verify?: boolean
          max_per_day?: number
          morning_checkin?: boolean
          morning_hour?: number
          plan_nudge?: boolean
          quiet_end?: number
          quiet_start?: number
          surprise_window?: boolean
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          evening_hour?: number
          evening_log?: boolean
          insights_digest?: boolean
          insights_new?: boolean
          insights_reminder?: boolean
          insights_verify?: boolean
          max_per_day?: number
          morning_checkin?: boolean
          morning_hour?: number
          plan_nudge?: boolean
          quiet_end?: number
          quiet_start?: number
          surprise_window?: boolean
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pantry_items: {
        Row: {
          barcode: string | null
          category: string
          created_at: string
          expires_at: string | null
          id: string
          location: string
          name: string
          quantity: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          barcode?: string | null
          category?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          location?: string
          name: string
          quantity?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          barcode?: string | null
          category?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          location?: string
          name?: string
          quantity?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      point_logs: {
        Row: {
          action_key: string
          action_label: string
          created_at: string
          domain: Database["public"]["Enums"]["behavior_domain"]
          id: string
          notes: string | null
          points: number
          user_id: string
        }
        Insert: {
          action_key: string
          action_label: string
          created_at?: string
          domain: Database["public"]["Enums"]["behavior_domain"]
          id?: string
          notes?: string | null
          points: number
          user_id: string
        }
        Update: {
          action_key?: string
          action_label?: string
          created_at?: string
          domain?: Database["public"]["Enums"]["behavior_domain"]
          id?: string
          notes?: string | null
          points?: number
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          charity: string | null
          created_at: string
          currency: string
          dashboard_prefs: Json
          display_name: string | null
          id: string
          onboarding_answers: Json
          onboarding_complete: boolean
          preferred_stores: string[]
          updated_at: string
          vault_destination_label: string | null
        }
        Insert: {
          charity?: string | null
          created_at?: string
          currency?: string
          dashboard_prefs?: Json
          display_name?: string | null
          id: string
          onboarding_answers?: Json
          onboarding_complete?: boolean
          preferred_stores?: string[]
          updated_at?: string
          vault_destination_label?: string | null
        }
        Update: {
          charity?: string | null
          created_at?: string
          currency?: string
          dashboard_prefs?: Json
          display_name?: string | null
          id?: string
          onboarding_answers?: Json
          onboarding_complete?: boolean
          preferred_stores?: string[]
          updated_at?: string
          vault_destination_label?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      stakes: {
        Row: {
          charity: string | null
          created_at: string
          id: string
          month_start: string
          monthly_amount_sek: number
          recovered_amount_sek: number
          tier: Database["public"]["Enums"]["stake_tier"]
          user_id: string
        }
        Insert: {
          charity?: string | null
          created_at?: string
          id?: string
          month_start: string
          monthly_amount_sek: number
          recovered_amount_sek?: number
          tier?: Database["public"]["Enums"]["stake_tier"]
          user_id: string
        }
        Update: {
          charity?: string | null
          created_at?: string
          id?: string
          month_start?: string
          monthly_amount_sek?: number
          recovered_amount_sek?: number
          tier?: Database["public"]["Enums"]["stake_tier"]
          user_id?: string
        }
        Relationships: []
      }
      streaks: {
        Row: {
          current_days: number
          last_active_date: string | null
          longest_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          current_days?: number
          last_active_date?: string | null
          longest_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          current_days?: number
          last_active_date?: string | null
          longest_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_memory: {
        Row: {
          default_location: string | null
          extra: Json
          financial_state: string | null
          height_cm: number | null
          job: string | null
          photo_url: string | null
          updated_at: string
          user_id: string
          weight_kg: number | null
        }
        Insert: {
          default_location?: string | null
          extra?: Json
          financial_state?: string | null
          height_cm?: number | null
          job?: string | null
          photo_url?: string | null
          updated_at?: string
          user_id: string
          weight_kg?: number | null
        }
        Update: {
          default_location?: string | null
          extra?: Json
          financial_state?: string | null
          height_cm?: number | null
          job?: string | null
          photo_url?: string | null
          updated_at?: string
          user_id?: string
          weight_kg?: number | null
        }
        Relationships: []
      }
      vault_transfers: {
        Row: {
          amount: number
          created_at: string
          currency: string
          destination_label: string | null
          id: string
          month_start: string
          note: string | null
          transferred_on: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          destination_label?: string | null
          id?: string
          month_start: string
          note?: string | null
          transferred_on?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          destination_label?: string | null
          id?: string
          month_start?: string
          note?: string | null
          transferred_on?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      behavior_domain:
        | "physical"
        | "mental"
        | "social"
        | "self_regulation"
        | "consistency"
      completion_status: "yes" | "partly" | "no"
      dump_category: "action" | "curiosity" | "purchase" | "anxiety" | "other"
      message_role: "user" | "assistant"
      stake_tier: "starter" | "standard" | "committed" | "all_in"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      behavior_domain: [
        "physical",
        "mental",
        "social",
        "self_regulation",
        "consistency",
      ],
      completion_status: ["yes", "partly", "no"],
      dump_category: ["action", "curiosity", "purchase", "anxiety", "other"],
      message_role: ["user", "assistant"],
      stake_tier: ["starter", "standard", "committed", "all_in"],
    },
  },
} as const
