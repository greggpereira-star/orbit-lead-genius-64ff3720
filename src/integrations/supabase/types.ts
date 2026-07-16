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
      app_internal_config: {
        Row: {
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          assigned_to: string | null
          company_id: string
          created_at: string
          department_id: string | null
          id: string
          last_message_at: string
          lead_id: string | null
          metadata: Json
          page_url: string | null
          referrer: string | null
          status: string
          tracking: Json
          unread_agent: number
          unread_visitor: number
          updated_at: string
          visitor_email: string | null
          visitor_id: string
          visitor_name: string | null
          visitor_phone: string | null
        }
        Insert: {
          assigned_to?: string | null
          company_id: string
          created_at?: string
          department_id?: string | null
          id?: string
          last_message_at?: string
          lead_id?: string | null
          metadata?: Json
          page_url?: string | null
          referrer?: string | null
          status?: string
          tracking?: Json
          unread_agent?: number
          unread_visitor?: number
          updated_at?: string
          visitor_email?: string | null
          visitor_id: string
          visitor_name?: string | null
          visitor_phone?: string | null
        }
        Update: {
          assigned_to?: string | null
          company_id?: string
          created_at?: string
          department_id?: string | null
          id?: string
          last_message_at?: string
          lead_id?: string | null
          metadata?: Json
          page_url?: string | null
          referrer?: string | null
          status?: string
          tracking?: Json
          unread_agent?: number
          unread_visitor?: number
          updated_at?: string
          visitor_email?: string | null
          visitor_id?: string
          visitor_name?: string | null
          visitor_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_conversations_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_departments: {
        Row: {
          color: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          attachments: Json
          company_id: string
          content: string
          conversation_id: string
          created_at: string
          id: string
          read_at: string | null
          sender_id: string | null
          sender_type: string
        }
        Insert: {
          attachments?: Json
          company_id: string
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string | null
          sender_type: string
        }
        Update: {
          attachments?: Json
          company_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          read_at?: string | null
          sender_id?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_operators: {
        Row: {
          avatar_url: string | null
          company_id: string
          created_at: string
          department_id: string | null
          display_name: string | null
          id: string
          is_active: boolean
          last_seen_at: string | null
          max_concurrent: number
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          company_id: string
          created_at?: string
          department_id?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          max_concurrent?: number
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          department_id?: string | null
          display_name?: string | null
          id?: string
          is_active?: boolean
          last_seen_at?: string | null
          max_concurrent?: number
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_operators_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_operators_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "chat_departments"
            referencedColumns: ["id"]
          },
        ]
      }
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
      conversion_mapping: {
        Row: {
          company_id: string
          created_at: string | null
          external_event_name: string
          form_id: string | null
          id: string
          is_active: boolean | null
          platform: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          external_event_name: string
          form_id?: string | null
          id?: string
          is_active?: boolean | null
          platform: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          external_event_name?: string
          form_id?: string | null
          id?: string
          is_active?: boolean | null
          platform?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversion_mapping_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversion_mapping_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      cvcrm_dead_letter_queue: {
        Row: {
          company_id: string
          created_at: string | null
          delivery_log_id: string | null
          failure_reason: string | null
          id: string
          last_error: string | null
          lead_id: string
          payload: Json | null
          resolved_at: string | null
          retry_count: number | null
          trace_id: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          delivery_log_id?: string | null
          failure_reason?: string | null
          id?: string
          last_error?: string | null
          lead_id: string
          payload?: Json | null
          resolved_at?: string | null
          retry_count?: number | null
          trace_id?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          delivery_log_id?: string | null
          failure_reason?: string | null
          id?: string
          last_error?: string | null
          lead_id?: string
          payload?: Json | null
          resolved_at?: string | null
          retry_count?: number | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cvcrm_dead_letter_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cvcrm_dead_letter_queue_delivery_log_id_fkey"
            columns: ["delivery_log_id"]
            isOneToOne: false
            referencedRelation: "cvcrm_delivery_logs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cvcrm_dead_letter_queue_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      cvcrm_delivery_logs: {
        Row: {
          attempt_count: number | null
          company_id: string
          created_at: string | null
          cvcrm_lead_id: string | null
          error_message: string | null
          id: string
          idempotency_key: string | null
          lead_id: string
          next_retry_at: string | null
          request_payload: Json | null
          response_payload: Json | null
          sent_at: string | null
          status: string
          status_code: number | null
          trace_id: string | null
          updated_at: string | null
        }
        Insert: {
          attempt_count?: number | null
          company_id: string
          created_at?: string | null
          cvcrm_lead_id?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          lead_id: string
          next_retry_at?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          sent_at?: string | null
          status: string
          status_code?: number | null
          trace_id?: string | null
          updated_at?: string | null
        }
        Update: {
          attempt_count?: number | null
          company_id?: string
          created_at?: string | null
          cvcrm_lead_id?: string | null
          error_message?: string | null
          id?: string
          idempotency_key?: string | null
          lead_id?: string
          next_retry_at?: string | null
          request_payload?: Json | null
          response_payload?: Json | null
          sent_at?: string | null
          status?: string
          status_code?: number | null
          trace_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cvcrm_delivery_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cvcrm_delivery_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      cvcrm_field_mappings: {
        Row: {
          company_id: string
          created_at: string | null
          cvcrm_custom_field_id: string | null
          cvcrm_field: string
          cvcrm_integration_id: string
          id: string
          is_custom_field: boolean | null
          leadflow_field: string
          required: boolean | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          cvcrm_custom_field_id?: string | null
          cvcrm_field: string
          cvcrm_integration_id: string
          id?: string
          is_custom_field?: boolean | null
          leadflow_field: string
          required?: boolean | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          cvcrm_custom_field_id?: string | null
          cvcrm_field?: string
          cvcrm_integration_id?: string
          id?: string
          is_custom_field?: boolean | null
          leadflow_field?: string
          required?: boolean | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cvcrm_field_mappings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cvcrm_field_mappings_cvcrm_integration_id_fkey"
            columns: ["cvcrm_integration_id"]
            isOneToOne: false
            referencedRelation: "cvcrm_integrations"
            referencedColumns: ["id"]
          },
        ]
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
      error_logs: {
        Row: {
          company_id: string | null
          context: Json | null
          created_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          stack_trace: string | null
          trace_id: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          context?: Json | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          stack_trace?: string | null
          trace_id?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          context?: Json | null
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          stack_trace?: string | null
          trace_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      export_audit_logs: {
        Row: {
          created_at: string
          export_type: string
          file_url: string | null
          filters: Json | null
          form_id: string | null
          id: string
          row_count: number | null
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          export_type: string
          file_url?: string | null
          filters?: Json | null
          form_id?: string | null
          id?: string
          row_count?: number | null
          status: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          export_type?: string
          file_url?: string | null
          filters?: Json | null
          form_id?: string | null
          id?: string
          row_count?: number | null
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "export_audit_logs_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "export_audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      form_events: {
        Row: {
          browser: string | null
          city: string | null
          country: string | null
          created_at: string
          device: string | null
          ecommerce_context: Json | null
          embed_mode: string | null
          event_name: string
          event_type: string | null
          fbclid: string | null
          form_id: string | null
          form_slug: string | null
          gbraid: string | null
          gclid: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          os: string | null
          page_url: string | null
          referrer: string | null
          session_id: string | null
          source: string | null
          submission_id: string | null
          tenant_id: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string | null
          wbraid: string | null
        }
        Insert: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          ecommerce_context?: Json | null
          embed_mode?: string | null
          event_name: string
          event_type?: string | null
          fbclid?: string | null
          form_id?: string | null
          form_slug?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          os?: string | null
          page_url?: string | null
          referrer?: string | null
          session_id?: string | null
          source?: string | null
          submission_id?: string | null
          tenant_id: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
          wbraid?: string | null
        }
        Update: {
          browser?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          device?: string | null
          ecommerce_context?: Json | null
          embed_mode?: string | null
          event_name?: string
          event_type?: string | null
          fbclid?: string | null
          form_id?: string | null
          form_slug?: string | null
          gbraid?: string | null
          gclid?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          os?: string | null
          page_url?: string | null
          referrer?: string | null
          session_id?: string | null
          source?: string | null
          submission_id?: string | null
          tenant_id?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string | null
          wbraid?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_events_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      form_field_options: {
        Row: {
          company_id: string
          created_at: string | null
          field_id: string
          form_id: string
          id: string
          label: string
          metadata: Json | null
          score: number | null
          sort_order: number
          tag: string | null
          updated_at: string | null
          value: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          field_id: string
          form_id: string
          id?: string
          label: string
          metadata?: Json | null
          score?: number | null
          sort_order: number
          tag?: string | null
          updated_at?: string | null
          value: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          field_id?: string
          form_id?: string
          id?: string
          label?: string
          metadata?: Json | null
          score?: number | null
          sort_order?: number
          tag?: string | null
          updated_at?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_field_options_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_field_options_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          company_id: string | null
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
          step_id: string | null
          step_number: number
          type: string
          updated_at: string
          validation_rules: Json | null
        }
        Insert: {
          company_id?: string | null
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
          step_id?: string | null
          step_number?: number
          type: string
          updated_at?: string
          validation_rules?: Json | null
        }
        Update: {
          company_id?: string | null
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
          step_id?: string | null
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
      form_partial_submissions: {
        Row: {
          answers: Json | null
          company_id: string
          created_at: string | null
          current_step_id: string | null
          current_step_index: number | null
          expires_at: string | null
          form_id: string
          form_slug: string
          id: string
          lead_id: string | null
          score_preview: number | null
          session_id: string
          status: string
          temperature_preview: string | null
          tracking: Json | null
          updated_at: string | null
          visitor_id: string | null
        }
        Insert: {
          answers?: Json | null
          company_id: string
          created_at?: string | null
          current_step_id?: string | null
          current_step_index?: number | null
          expires_at?: string | null
          form_id: string
          form_slug: string
          id?: string
          lead_id?: string | null
          score_preview?: number | null
          session_id: string
          status?: string
          temperature_preview?: string | null
          tracking?: Json | null
          updated_at?: string | null
          visitor_id?: string | null
        }
        Update: {
          answers?: Json | null
          company_id?: string
          created_at?: string | null
          current_step_id?: string | null
          current_step_index?: number | null
          expires_at?: string | null
          form_id?: string
          form_slug?: string
          id?: string
          lead_id?: string | null
          score_preview?: number | null
          session_id?: string
          status?: string
          temperature_preview?: string | null
          tracking?: Json | null
          updated_at?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_partial_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_partial_submissions_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_partial_submissions_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      form_scoring_rules: {
        Row: {
          company_id: string
          condition: Json
          created_at: string | null
          enabled: boolean | null
          field_id: string | null
          form_id: string
          id: string
          recommended_action: string | null
          rule_type: string
          score_delta: number
          step_id: string | null
          tag_to_apply: string | null
          temperature_override: string | null
          updated_at: string | null
        }
        Insert: {
          company_id: string
          condition?: Json
          created_at?: string | null
          enabled?: boolean | null
          field_id?: string | null
          form_id: string
          id?: string
          recommended_action?: string | null
          rule_type: string
          score_delta?: number
          step_id?: string | null
          tag_to_apply?: string | null
          temperature_override?: string | null
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          condition?: Json
          created_at?: string | null
          enabled?: boolean | null
          field_id?: string | null
          form_id?: string
          id?: string
          recommended_action?: string | null
          rule_type?: string
          score_delta?: number
          step_id?: string | null
          tag_to_apply?: string | null
          temperature_override?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_scoring_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_scoring_rules_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_scoring_rules_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_steps: {
        Row: {
          button_text: string | null
          company_id: string | null
          conditional_logic: Json | null
          created_at: string | null
          description: string | null
          form_id: string
          id: string
          sort_order: number
          title: string
          updated_at: string | null
        }
        Insert: {
          button_text?: string | null
          company_id?: string | null
          conditional_logic?: Json | null
          created_at?: string | null
          description?: string | null
          form_id: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string | null
        }
        Update: {
          button_text?: string | null
          company_id?: string | null
          conditional_logic?: Json | null
          created_at?: string | null
          description?: string | null
          form_id?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_steps_form_id_fkey"
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
          company_id: string
          created_at: string | null
          form_id: string
          id: string
          ip_address: string | null
          lead_id: string | null
          score: number | null
          tags: string[] | null
          temperature: string | null
          tracking: Json | null
          user_agent: string | null
        }
        Insert: {
          answers: Json
          company_id: string
          created_at?: string | null
          form_id: string
          id?: string
          ip_address?: string | null
          lead_id?: string | null
          score?: number | null
          tags?: string[] | null
          temperature?: string | null
          tracking?: Json | null
          user_agent?: string | null
        }
        Update: {
          answers?: Json
          company_id?: string
          created_at?: string | null
          form_id?: string
          id?: string
          ip_address?: string | null
          lead_id?: string | null
          score?: number | null
          tags?: string[] | null
          temperature?: string | null
          tracking?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
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
        ]
      }
      form_tag_rules: {
        Row: {
          company_id: string
          condition: Json
          created_at: string | null
          form_id: string
          id: string
          tag_name: string
          updated_at: string | null
        }
        Insert: {
          company_id: string
          condition?: Json
          created_at?: string | null
          form_id: string
          id?: string
          tag_name: string
          updated_at?: string | null
        }
        Update: {
          company_id?: string
          condition?: Json
          created_at?: string | null
          form_id?: string
          id?: string
          tag_name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_tag_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_tag_rules_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_temperature_rules: {
        Row: {
          color: string | null
          company_id: string
          created_at: string | null
          form_id: string
          id: string
          max_score: number
          min_score: number
          name: string
          priority: number | null
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          company_id: string
          created_at?: string | null
          form_id: string
          id?: string
          max_score: number
          min_score: number
          name: string
          priority?: number | null
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          company_id?: string
          created_at?: string | null
          form_id?: string
          id?: string
          max_score?: number
          min_score?: number
          name?: string
          priority?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_temperature_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_temperature_rules_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          settings: Json
          slug: string
          status: string
          type: string
          type_v2: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          settings?: Json
          slug: string
          status?: string
          type?: string
          type_v2?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          settings?: Json
          slug?: string
          status?: string
          type?: string
          type_v2?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "forms_tenant_id_fkey"
            columns: ["company_id"]
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
      lead_events: {
        Row: {
          created_at: string | null
          description: string | null
          event_type: string
          id: string
          lead_id: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_type: string
          id?: string
          lead_id: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_type?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_scores: {
        Row: {
          change_reason: string | null
          created_at: string | null
          id: string
          lead_id: string
          metadata: Json | null
          score: number
        }
        Insert: {
          change_reason?: string | null
          created_at?: string | null
          id?: string
          lead_id: string
          metadata?: Json | null
          score: number
        }
        Update: {
          change_reason?: string | null
          created_at?: string | null
          id?: string
          lead_id?: string
          metadata?: Json | null
          score?: number
        }
        Relationships: [
          {
            foreignKeyName: "lead_scores_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
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
      lead_tags: {
        Row: {
          created_at: string | null
          id: string
          lead_id: string
          tag_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          lead_id: string
          tag_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          lead_id?: string
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_timeline_events: {
        Row: {
          company_id: string
          created_at: string | null
          event_type: string
          id: string
          lead_id: string
          metadata: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string | null
          event_type: string
          id?: string
          lead_id: string
          metadata?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string | null
          event_type?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_timeline_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_timeline_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
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
          score: number | null
          source: string | null
          status: string | null
          sync_status: string | null
          temperature: string | null
          updated_at: string
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
        }
        Insert: {
          assigned_to?: string | null
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
          score?: number | null
          source?: string | null
          status?: string | null
          sync_status?: string | null
          temperature?: string | null
          updated_at?: string
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
        }
        Update: {
          assigned_to?: string | null
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
          score?: number | null
          source?: string | null
          status?: string | null
          sync_status?: string | null
          temperature?: string | null
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
      meta_lead_connections: {
        Row: {
          access_token: string
          company_id: string
          connected_by: string | null
          created_at: string
          granted_scopes: string[]
          id: string
          meta_user_id: string
          meta_user_name: string | null
          status: string
          token_expires_at: string | null
          updated_at: string
        }
        Insert: {
          access_token: string
          company_id: string
          connected_by?: string | null
          created_at?: string
          granted_scopes?: string[]
          id?: string
          meta_user_id: string
          meta_user_name?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Update: {
          access_token?: string
          company_id?: string
          connected_by?: string | null
          created_at?: string
          granted_scopes?: string[]
          id?: string
          meta_user_id?: string
          meta_user_name?: string | null
          status?: string
          token_expires_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_lead_events: {
        Row: {
          ad_id: string | null
          company_id: string | null
          created_at: string
          error_message: string | null
          form_id: string | null
          id: string
          lead_id: string | null
          leadgen_id: string
          page_id: string
          processed_at: string | null
          raw_payload: Json
          received_at: string
          status: string
          updated_at: string
        }
        Insert: {
          ad_id?: string | null
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          form_id?: string | null
          id?: string
          lead_id?: string | null
          leadgen_id: string
          page_id: string
          processed_at?: string | null
          raw_payload: Json
          received_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          ad_id?: string | null
          company_id?: string | null
          created_at?: string
          error_message?: string | null
          form_id?: string | null
          id?: string
          lead_id?: string | null
          leadgen_id?: string
          page_id?: string
          processed_at?: string | null
          raw_payload?: Json
          received_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_lead_forms: {
        Row: {
          company_id: string
          created_at: string
          field_mapping: Json
          form_id: string
          form_name: string
          id: string
          is_active: boolean
          page_id: string
          questions: Json
          status: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          field_mapping?: Json
          form_id: string
          form_name: string
          id?: string
          is_active?: boolean
          page_id: string
          questions?: Json
          status?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          field_mapping?: Json
          form_id?: string
          form_name?: string
          id?: string
          is_active?: boolean
          page_id?: string
          questions?: Json
          status?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_forms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_lead_pages: {
        Row: {
          category: string | null
          company_id: string
          connection_id: string
          created_at: string
          id: string
          page_access_token: string
          page_id: string
          page_name: string
          subscribed: boolean
          subscribed_at: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          company_id: string
          connection_id: string
          created_at?: string
          id?: string
          page_access_token: string
          page_id: string
          page_name: string
          subscribed?: boolean
          subscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          company_id?: string
          connection_id?: string
          created_at?: string
          id?: string
          page_access_token?: string
          page_id?: string
          page_name?: string
          subscribed?: boolean
          subscribed_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_lead_pages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meta_lead_pages_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "meta_lead_connections"
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
      page_views: {
        Row: {
          created_at: string | null
          id: string
          session_id: string
          title: string | null
          url: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          session_id: string
          title?: string | null
          url: string
        }
        Update: {
          created_at?: string | null
          id?: string
          session_id?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_views_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
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
      quiz_events: {
        Row: {
          block_id: string | null
          company_id: string
          created_at: string
          event_type: string
          id: string
          payload: Json
          quiz_id: string
          session_id: string | null
          submission_id: string | null
          trace_id: string | null
        }
        Insert: {
          block_id?: string | null
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          payload?: Json
          quiz_id: string
          session_id?: string | null
          submission_id?: string | null
          trace_id?: string | null
        }
        Update: {
          block_id?: string | null
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          payload?: Json
          quiz_id?: string
          session_id?: string | null
          submission_id?: string | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_events_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quiz_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "quiz_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_funnels: {
        Row: {
          archived_at: string | null
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          design: Json
          id: string
          identity: Json
          integrations: Json
          last_response_at: string | null
          layout_mode: Database["public"]["Enums"]["quiz_layout_mode"]
          name: string
          niche: string | null
          published_at: string | null
          published_version_id: string | null
          settings: Json
          slug: string
          stats: Json
          status: Database["public"]["Enums"]["quiz_status"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          design?: Json
          id?: string
          identity?: Json
          integrations?: Json
          last_response_at?: string | null
          layout_mode?: Database["public"]["Enums"]["quiz_layout_mode"]
          name: string
          niche?: string | null
          published_at?: string | null
          published_version_id?: string | null
          settings?: Json
          slug: string
          stats?: Json
          status?: Database["public"]["Enums"]["quiz_status"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          design?: Json
          id?: string
          identity?: Json
          integrations?: Json
          last_response_at?: string | null
          layout_mode?: Database["public"]["Enums"]["quiz_layout_mode"]
          name?: string
          niche?: string | null
          published_at?: string | null
          published_version_id?: string | null
          settings?: Json
          slug?: string
          stats?: Json
          status?: Database["public"]["Enums"]["quiz_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_funnels_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_funnels_published_version_fk"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "quiz_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_media: {
        Row: {
          alt_text: string | null
          company_id: string
          created_at: string
          duration_ms: number | null
          height: number | null
          id: string
          media_type: string
          metadata: Json
          mime_type: string | null
          quiz_id: string | null
          size_bytes: number | null
          storage_path: string | null
          thumbnail_url: string | null
          updated_at: string
          uploaded_by: string | null
          url: string
          width: number | null
        }
        Insert: {
          alt_text?: string | null
          company_id: string
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          media_type: string
          metadata?: Json
          mime_type?: string | null
          quiz_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
          url: string
          width?: number | null
        }
        Update: {
          alt_text?: string | null
          company_id?: string
          created_at?: string
          duration_ms?: number | null
          height?: number | null
          id?: string
          media_type?: string
          metadata?: Json
          mime_type?: string | null
          quiz_id?: string | null
          size_bytes?: number | null
          storage_path?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          uploaded_by?: string | null
          url?: string
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_media_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_media_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quiz_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_submissions: {
        Row: {
          answers: Json
          company_id: string
          completed_at: string | null
          consent: Json
          created_at: string
          device: Json
          id: string
          lead_id: string | null
          quiz_id: string
          result_key: string | null
          result_snapshot: Json
          score: number | null
          session_id: string | null
          started_at: string
          status: string
          tags: string[]
          temperature: Database["public"]["Enums"]["quiz_temperature"] | null
          trace_id: string | null
          tracking: Json
          updated_at: string
          version_id: string | null
        }
        Insert: {
          answers?: Json
          company_id: string
          completed_at?: string | null
          consent?: Json
          created_at?: string
          device?: Json
          id?: string
          lead_id?: string | null
          quiz_id: string
          result_key?: string | null
          result_snapshot?: Json
          score?: number | null
          session_id?: string | null
          started_at?: string
          status?: string
          tags?: string[]
          temperature?: Database["public"]["Enums"]["quiz_temperature"] | null
          trace_id?: string | null
          tracking?: Json
          updated_at?: string
          version_id?: string | null
        }
        Update: {
          answers?: Json
          company_id?: string
          completed_at?: string | null
          consent?: Json
          created_at?: string
          device?: Json
          id?: string
          lead_id?: string | null
          quiz_id?: string
          result_key?: string | null
          result_snapshot?: Json
          score?: number | null
          session_id?: string | null
          started_at?: string
          status?: string
          tags?: string[]
          temperature?: Database["public"]["Enums"]["quiz_temperature"] | null
          trace_id?: string | null
          tracking?: Json
          updated_at?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_submissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_submissions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quiz_funnels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_submissions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "quiz_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      quiz_templates: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          niche: string | null
          schema: Json
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          niche?: string | null
          schema?: Json
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          niche?: string | null
          schema?: Json
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      quiz_versions: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          published_at: string | null
          quiz_id: string
          schema: Json
          updated_at: string
          version: number
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          quiz_id: string
          schema?: Json
          updated_at?: string
          version?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          quiz_id?: string
          schema?: Json
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_versions_quiz_id_fkey"
            columns: ["quiz_id"]
            isOneToOne: false
            referencedRelation: "quiz_funnels"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_configs: {
        Row: {
          company_id: string
          created_at: string
          fallback_user_id: string | null
          hot_threshold: number
          id: string
          is_active: boolean
          name: string
          strategy: string
          updated_at: string
          warm_threshold: number
        }
        Insert: {
          company_id: string
          created_at?: string
          fallback_user_id?: string | null
          hot_threshold?: number
          id?: string
          is_active?: boolean
          name?: string
          strategy?: string
          updated_at?: string
          warm_threshold?: number
        }
        Update: {
          company_id?: string
          created_at?: string
          fallback_user_id?: string | null
          hot_threshold?: number
          id?: string
          is_active?: boolean
          name?: string
          strategy?: string
          updated_at?: string
          warm_threshold?: number
        }
        Relationships: [
          {
            foreignKeyName: "routing_configs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      routing_members: {
        Row: {
          company_id: string
          config_id: string
          created_at: string
          id: string
          is_available: boolean
          last_assigned_at: string | null
          performance_score: number
          updated_at: string
          user_id: string
          weight: number
        }
        Insert: {
          company_id: string
          config_id: string
          created_at?: string
          id?: string
          is_available?: boolean
          last_assigned_at?: string | null
          performance_score?: number
          updated_at?: string
          user_id: string
          weight?: number
        }
        Update: {
          company_id?: string
          config_id?: string
          created_at?: string
          id?: string
          is_available?: boolean
          last_assigned_at?: string | null
          performance_score?: number
          updated_at?: string
          user_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "routing_members_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routing_members_config_id_fkey"
            columns: ["config_id"]
            isOneToOne: false
            referencedRelation: "routing_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          company_id: string
          created_at: string | null
          fbclid: string | null
          gclid: string | null
          id: string
          updated_at: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          visitor_id: string
        }
        Insert: {
          company_id: string
          created_at?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id: string
        }
        Update: {
          company_id?: string
          created_at?: string | null
          fbclid?: string | null
          gclid?: string | null
          id?: string
          updated_at?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
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
          component: string | null
          created_at: string | null
          id: string
          level: string
          message: string
          payload: Json | null
          route: string | null
          trace_id: string | null
          user_id: string | null
        }
        Insert: {
          company_id?: string | null
          component?: string | null
          created_at?: string | null
          id?: string
          level: string
          message: string
          payload?: Json | null
          route?: string | null
          trace_id?: string | null
          user_id?: string | null
        }
        Update: {
          company_id?: string | null
          component?: string | null
          created_at?: string | null
          id?: string
          level?: string
          message?: string
          payload?: Json | null
          route?: string | null
          trace_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_logs_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_capi_dlq: {
        Row: {
          attempts: number
          click_event_id: string | null
          company_id: string
          created_at: string
          event_id: string | null
          id: string
          last_error: string | null
          payload: Json | null
          resolved_at: string | null
          trace_id: string | null
        }
        Insert: {
          attempts?: number
          click_event_id?: string | null
          company_id: string
          created_at?: string
          event_id?: string | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          resolved_at?: string | null
          trace_id?: string | null
        }
        Update: {
          attempts?: number
          click_event_id?: string | null
          company_id?: string
          created_at?: string
          event_id?: string | null
          id?: string
          last_error?: string | null
          payload?: Json | null
          resolved_at?: string | null
          trace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_capi_dlq_click_event_id_fkey"
            columns: ["click_event_id"]
            isOneToOne: false
            referencedRelation: "whatsapp_click_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_capi_dlq_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_click_events: {
        Row: {
          capi_attempts: number
          capi_last_error: string | null
          capi_response: Json | null
          capi_sent_at: string | null
          capi_status: string
          company_id: string
          created_at: string
          event_id: string
          final_url: string | null
          id: string
          lead_id: string | null
          message: string | null
          page_url: string | null
          phone_destination: string | null
          referrer: string | null
          session_id: string | null
          trace_id: string | null
          tracking: Json
          user_agent: string | null
          visitor_id: string | null
        }
        Insert: {
          capi_attempts?: number
          capi_last_error?: string | null
          capi_response?: Json | null
          capi_sent_at?: string | null
          capi_status?: string
          company_id: string
          created_at?: string
          event_id?: string
          final_url?: string | null
          id?: string
          lead_id?: string | null
          message?: string | null
          page_url?: string | null
          phone_destination?: string | null
          referrer?: string | null
          session_id?: string | null
          trace_id?: string | null
          tracking?: Json
          user_agent?: string | null
          visitor_id?: string | null
        }
        Update: {
          capi_attempts?: number
          capi_last_error?: string | null
          capi_response?: Json | null
          capi_sent_at?: string | null
          capi_status?: string
          company_id?: string
          created_at?: string
          event_id?: string
          final_url?: string | null
          id?: string
          lead_id?: string | null
          message?: string | null
          page_url?: string | null
          phone_destination?: string | null
          referrer?: string | null
          session_id?: string | null
          trace_id?: string | null
          tracking?: Json
          user_agent?: string | null
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "whatsapp_click_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "whatsapp_click_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_membership: { Args: { p_company_id: string }; Returns: boolean }
      check_membership_internal: {
        Args: { p_company_id: string; p_user_id: string }
        Returns: boolean
      }
      check_membership_test: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      check_membership_v2: { Args: { p_company_id: string }; Returns: boolean }
      create_form_with_fields: {
        Args: { p_fields?: Json; p_form_data: Json; p_tenant_id: string }
        Returns: string
      }
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
      get_user_tenant_ids: {
        Args: never
        Returns: {
          company_id: string
        }[]
      }
      get_workspace_context_v1: { Args: never; Returns: Json }
      pick_next_routing_member: {
        Args: { p_config_id: string; p_prefer_top?: boolean }
        Returns: string
      }
      save_form_builder_v1: {
        Args: {
          p_company_id: string
          p_fields?: Json
          p_form_data: Json
          p_form_id: string
          p_options_by_field?: Json
          p_steps?: Json
        }
        Returns: Json
      }
      save_form_core_v1: {
        Args: {
          p_company_id: string
          p_description: string
          p_form_id: string
          p_name: string
          p_settings: Json
          p_slug: string
          p_status: string
          p_type?: string
        }
        Returns: string
      }
      save_form_fields_delta_v1: {
        Args: {
          p_company_id: string
          p_fields_delete: string[]
          p_fields_upsert: Json
          p_form_id: string
        }
        Returns: undefined
      }
      save_form_options_batch_v1: {
        Args: {
          p_company_id: string
          p_form_id: string
          p_options_by_field: Json
        }
        Returns: Json
      }
      save_form_options_delta_v1: {
        Args: {
          p_company_id: string
          p_field_id: string
          p_form_id: string
          p_options_delete: string[]
          p_options_upsert: Json
        }
        Returns: undefined
      }
      save_form_v2: {
        Args: {
          p_company_id: string
          p_fields?: Json
          p_form_data: Json
          p_form_id: string
          p_steps?: Json
        }
        Returns: Json
      }
      update_form_with_fields: {
        Args: { p_fields: Json; p_form_data: Json; p_form_id: string }
        Returns: undefined
      }
    }
    Enums: {
      form_type: "standard" | "multi_step" | "quiz" | "conversational"
      quiz_layout_mode:
        | "fullscreen"
        | "card"
        | "split"
        | "story"
        | "inline"
        | "modal"
      quiz_status: "draft" | "published" | "archived"
      quiz_temperature: "hot" | "warm" | "cold"
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
      form_type: ["standard", "multi_step", "quiz", "conversational"],
      quiz_layout_mode: [
        "fullscreen",
        "card",
        "split",
        "story",
        "inline",
        "modal",
      ],
      quiz_status: ["draft", "published", "archived"],
      quiz_temperature: ["hot", "warm", "cold"],
    },
  },
} as const
