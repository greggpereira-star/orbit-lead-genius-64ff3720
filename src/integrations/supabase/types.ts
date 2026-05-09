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
      companies: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      cvcrm_integrations: {
        Row: {
          api_token: string
          api_user: string
          company_id: string
          connection_status: string | null
          created_at: string
          cvcrm_base_url: string
          id: string
          is_active: boolean | null
          last_health_check: string | null
          updated_at: string
        }
        Insert: {
          api_token: string
          api_user: string
          company_id: string
          connection_status?: string | null
          created_at?: string
          cvcrm_base_url: string
          id?: string
          is_active?: boolean | null
          last_health_check?: string | null
          updated_at?: string
        }
        Update: {
          api_token?: string
          api_user?: string
          company_id?: string
          connection_status?: string | null
          created_at?: string
          cvcrm_base_url?: string
          id?: string
          is_active?: boolean | null
          last_health_check?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cvcrm_sync_logs: {
        Row: {
          company_id: string
          created_at: string
          direction: string | null
          error_message: string | null
          id: string
          latency_ms: number | null
          lead_id: string | null
          payload_received: Json | null
          payload_sent: Json | null
          request_id: string | null
          status_code: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          direction?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          lead_id?: string | null
          payload_received?: Json | null
          payload_sent?: Json | null
          request_id?: string | null
          status_code?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          direction?: string | null
          error_message?: string | null
          id?: string
          latency_ms?: number | null
          lead_id?: string | null
          payload_received?: Json | null
          payload_sent?: Json | null
          request_id?: string | null
          status_code?: number | null
        }
        Relationships: []
      }
      cvcrm_sync_queue: {
        Row: {
          company_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          last_error: string | null
          retry_count: number | null
          status: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          last_error?: string | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          last_error?: string | null
          retry_count?: number | null
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      form_analytics: {
        Row: {
          created_at: string
          event_type: string
          form_id: string
          id: string
          metadata: Json | null
          tenant_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          form_id: string
          id?: string
          metadata?: Json | null
          tenant_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          form_id?: string
          id?: string
          metadata?: Json | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_analytics_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          created_at: string
          form_id: string
          id: string
          label: string
          logic_rules: Json | null
          name: string
          options: Json | null
          placeholder: string | null
          required: boolean | null
          score_rules: Json | null
          sort_order: number
          step_number: number
          type: string
          updated_at: string
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string
          form_id: string
          id?: string
          label: string
          logic_rules?: Json | null
          name: string
          options?: Json | null
          placeholder?: string | null
          required?: boolean | null
          score_rules?: Json | null
          sort_order?: number
          step_number?: number
          type: string
          updated_at?: string
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string
          form_id?: string
          id?: string
          label?: string
          logic_rules?: Json | null
          name?: string
          options?: Json | null
          placeholder?: string | null
          required?: boolean | null
          score_rules?: Json | null
          sort_order?: number
          step_number?: number
          type?: string
          updated_at?: string
          validation_rules?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_submissions: {
        Row: {
          answers: Json
          created_at: string
          form_id: string
          id: string
          lead_id: string | null
          metadata: Json | null
          score_total: number | null
          tenant_id: string
          tracking_data: Json | null
        }
        Insert: {
          answers: Json
          created_at?: string
          form_id: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          score_total?: number | null
          tenant_id: string
          tracking_data?: Json | null
        }
        Update: {
          answers?: Json
          created_at?: string
          form_id?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          score_total?: number | null
          tenant_id?: string
          tracking_data?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          settings: Json
          slug: string
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          settings?: Json
          slug: string
          status?: string
          tenant_id: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          settings?: Json
          slug?: string
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      google_assets: {
        Row: {
          asset_type: string
          company_id: string
          conversion_mapping: Json | null
          created_at: string
          external_id: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          asset_type: string
          company_id: string
          conversion_mapping?: Json | null
          created_at?: string
          external_id: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          company_id?: string
          conversion_mapping?: Json | null
          created_at?: string
          external_id?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_audit_logs: {
        Row: {
          company_id: string | null
          created_at: string | null
          error_message: string | null
          event_type: string
          id: string
          ip_address: string | null
          payload: Json | null
          provider: string
          status: string
          trace_id: string | null
          user_agent: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          provider: string
          status: string
          trace_id?: string | null
          user_agent?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          payload?: Json | null
          provider?: string
          status?: string
          trace_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_audit_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_jobs: {
        Row: {
          company_id: string | null
          created_at: string | null
          id: string
          last_error: string | null
          max_retries: number | null
          next_retry_at: string | null
          payload: Json
          queue_name: string
          retries: number | null
          status: string
          trace_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          max_retries?: number | null
          next_retry_at?: string | null
          payload: Json
          queue_name: string
          retries?: number | null
          status?: string
          trace_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          id?: string
          last_error?: string | null
          max_retries?: number | null
          next_retry_at?: string | null
          payload?: Json
          queue_name?: string
          retries?: number | null
          status?: string
          trace_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_jobs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_webhooks: {
        Row: {
          company_id: string
          created_at: string
          external_id: string | null
          id: string
          last_event_at: string | null
          provider: string
          status: string | null
          target_asset_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          last_event_at?: string | null
          provider: string
          status?: string | null
          target_asset_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          last_event_at?: string | null
          provider?: string
          status?: string | null
          target_asset_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integration_webhooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          company_id: string
          config: Json | null
          created_at: string
          id: string
          last_sync_at: string | null
          provider: string
          status: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          config?: Json | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          provider: string
          status?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          config?: Json | null
          created_at?: string
          id?: string
          last_sync_at?: string | null
          provider?: string
          status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      lead_capture_logs: {
        Row: {
          company_id: string
          created_at: string
          error_message: string | null
          external_lead_id: string | null
          id: string
          payload: Json | null
          provider: string
          status: string | null
          trace_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          error_message?: string | null
          external_lead_id?: string | null
          id?: string
          payload?: Json | null
          provider: string
          status?: string | null
          trace_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          error_message?: string | null
          external_lead_id?: string | null
          id?: string
          payload?: Json | null
          provider?: string
          status?: string | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_capture_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_sync_logs: {
        Row: {
          company_id: string
          created_at: string | null
          error_message: string | null
          external_lead_id: string
          id: string
          payload: Json | null
          provider: string
          status: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          error_message?: string | null
          external_lead_id: string
          id?: string
          payload?: Json | null
          provider: string
          status?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          error_message?: string | null
          external_lead_id?: string
          id?: string
          payload?: Json | null
          provider?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_sync_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          company_id: string
          created_at: string
          cvcrm_id: string | null
          device_info: Json | null
          email: string | null
          event_id: string | null
          external_id: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          landing_page: string | null
          last_sync_at: string | null
          lead_score: number | null
          lead_temperature: string | null
          location_info: Json | null
          metadata: Json | null
          name: string | null
          phone: string | null
          referrer: string | null
          source: string | null
          status: string | null
          sync_status: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          cvcrm_id?: string | null
          device_info?: Json | null
          email?: string | null
          event_id?: string | null
          external_id?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          landing_page?: string | null
          last_sync_at?: string | null
          lead_score?: number | null
          lead_temperature?: string | null
          location_info?: Json | null
          metadata?: Json | null
          name?: string | null
          phone?: string | null
          referrer?: string | null
          source?: string | null
          status?: string | null
          sync_status?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          cvcrm_id?: string | null
          device_info?: Json | null
          email?: string | null
          event_id?: string | null
          external_id?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          landing_page?: string | null
          last_sync_at?: string | null
          lead_score?: number | null
          lead_temperature?: string | null
          location_info?: Json | null
          metadata?: Json | null
          name?: string | null
          phone?: string | null
          referrer?: string | null
          source?: string | null
          status?: string | null
          sync_status?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Relationships: []
      }
      memberships: {
        Row: {
          company_id: string
          created_at: string
          id: string
          role: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          role?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_assets: {
        Row: {
          asset_type: string
          company_id: string
          conversion_mapping: Json | null
          created_at: string
          external_id: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          asset_type: string
          company_id: string
          conversion_mapping?: Json | null
          created_at?: string
          external_id: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          company_id?: string
          conversion_mapping?: Json | null
          created_at?: string
          external_id?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_assets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      oauth_connections: {
        Row: {
          access_token: string
          company_id: string
          created_at: string
          expires_at: string | null
          external_id: string | null
          id: string
          metadata: Json | null
          provider: string
          refresh_token: string | null
          scopes: string[] | null
          status: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          company_id: string
          created_at?: string
          expires_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          provider: string
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          company_id?: string
          created_at?: string
          expires_at?: string | null
          external_id?: string | null
          id?: string
          metadata?: Json | null
          provider?: string
          refresh_token?: string | null
          scopes?: string[] | null
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oauth_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stages: {
        Row: {
          company_id: string
          created_at: string | null
          id: string
          name: string
          order_index: number | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          id?: string
          name: string
          order_index?: number | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          id?: string
          name?: string
          order_index?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      system_logs: {
        Row: {
          company_id: string | null
          correlation_id: string | null
          created_at: string | null
          id: string
          level: string
          message: string
          metadata: Json | null
          route: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          id?: string
          level: string
          message: string
          metadata?: Json | null
          route?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          id?: string
          level?: string
          message?: string
          metadata?: Json | null
          route?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_or_create_company: {
        Args: { p_name: string; p_slug: string; p_user_id: string }
        Returns: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          slug: string
        }
        SetofOptions: {
          from: "*"
          to: "companies"
          isOneToOne: true
          isSetofReturn: false
        }
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
    Enums: {},
  },
} as const
