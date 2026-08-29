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
      agent_profiles: {
        Row: {
          api_key_enc: string
          created_at: string
          id: string
          key_hint: string
          model: string
          provider: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_enc: string
          created_at?: string
          id?: string
          key_hint?: string
          model: string
          provider: string
          role: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_enc?: string
          created_at?: string
          id?: string
          key_hint?: string
          model?: string
          provider?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      block_embeddings: {
        Row: {
          block_id: string
          created_at: string
          embedding: string
          model: string
          version: number
        }
        Insert: {
          block_id: string
          created_at?: string
          embedding: string
          model: string
          version: number
        }
        Update: {
          block_id?: string
          created_at?: string
          embedding?: string
          model?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "block_embeddings_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      blocked_members: {
        Row: {
          blocked_member_id: string
          blocker_member_id: string
          created_at: string | null
          id: string
          trip_id: string
        }
        Insert: {
          blocked_member_id: string
          blocker_member_id: string
          created_at?: string | null
          id?: string
          trip_id: string
        }
        Update: {
          blocked_member_id?: string
          blocker_member_id?: string
          created_at?: string | null
          id?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocked_members_blocked_member_id_fkey"
            columns: ["blocked_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_members_blocker_member_id_fkey"
            columns: ["blocker_member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocked_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          content: Json
          content_hash: string
          created_at: string
          deleted_at: string | null
          id: string
          parent_id: string | null
          position: number
          type: string
          updated_at: string
          version: number
          workspace_id: string
        }
        Insert: {
          content?: Json
          content_hash: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_id?: string | null
          position: number
          type: string
          updated_at?: string
          version?: number
          workspace_id: string
        }
        Update: {
          content?: Json
          content_hash?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          parent_id?: string | null
          position?: number
          type?: string
          updated_at?: string
          version?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_access: {
        Row: {
          created_at: string | null
          member_id: string | null
          trip_id: string
          user_id: number
        }
        Insert: {
          created_at?: string | null
          member_id?: string | null
          trip_id: string
          user_id: number
        }
        Update: {
          created_at?: string | null
          member_id?: string | null
          trip_id?: string
          user_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "calendar_access_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_access_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_access_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_places: {
        Row: {
          audio_duration_sec: number | null
          audio_url: string | null
          audio_voice: string | null
          best_time: string | null
          booking_required: boolean
          description: string | null
          duration_min: number | null
          guide_script: string | null
          guide_script_words: number | null
          guide_version: number
          hook: string | null
          id: string
          kid_note: string | null
          lat: number | null
          lng: number | null
          name: string
          nearest_town: string | null
          price_gel_max: number | null
          price_gel_min: number | null
          price_lari: string | null
          region_id: string
          sort_order: number
          tags: string[]
          time_needed: string | null
          tips: string | null
        }
        Insert: {
          audio_duration_sec?: number | null
          audio_url?: string | null
          audio_voice?: string | null
          best_time?: string | null
          booking_required?: boolean
          description?: string | null
          duration_min?: number | null
          guide_script?: string | null
          guide_script_words?: number | null
          guide_version?: number
          hook?: string | null
          id: string
          kid_note?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          nearest_town?: string | null
          price_gel_max?: number | null
          price_gel_min?: number | null
          price_lari?: string | null
          region_id: string
          sort_order?: number
          tags?: string[]
          time_needed?: string | null
          tips?: string | null
        }
        Update: {
          audio_duration_sec?: number | null
          audio_url?: string | null
          audio_voice?: string | null
          best_time?: string | null
          booking_required?: boolean
          description?: string | null
          duration_min?: number | null
          guide_script?: string | null
          guide_script_words?: number | null
          guide_version?: number
          hook?: string | null
          id?: string
          kid_note?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          nearest_town?: string | null
          price_gel_max?: number | null
          price_gel_min?: number | null
          price_lari?: string | null
          region_id?: string
          sort_order?: number
          tags?: string[]
          time_needed?: string | null
          tips?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_places_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "catalog_regions"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_regions: {
        Row: {
          base_towns: string | null
          getting_there: string | null
          icon: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          subtitle: string | null
          summary: string | null
          when_to_go: string | null
        }
        Insert: {
          base_towns?: string | null
          getting_there?: string | null
          icon?: string
          id: string
          is_active?: boolean
          name: string
          sort_order?: number
          subtitle?: string | null
          summary?: string | null
          when_to_go?: string | null
        }
        Update: {
          base_towns?: string | null
          getting_there?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          subtitle?: string | null
          summary?: string | null
          when_to_go?: string | null
        }
        Relationships: []
      }
      class_meetings: {
        Row: {
          course_id: string
          created_at: string
          ends_at: string
          id: string
          note_block_id: string | null
          room: string | null
          session_id: string | null
          starts_at: string
          status: string
          topic: string | null
          unit_id: string | null
          workspace_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          ends_at: string
          id?: string
          note_block_id?: string | null
          room?: string | null
          session_id?: string | null
          starts_at: string
          status?: string
          topic?: string | null
          unit_id?: string | null
          workspace_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          note_block_id?: string | null
          room?: string | null
          session_id?: string | null
          starts_at?: string
          status?: string
          topic?: string | null
          unit_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_meetings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_meetings_note_block_id_fkey"
            columns: ["note_block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_meetings_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_meetings_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "syllabus_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_meetings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reports: {
        Row: {
          comment_id: number
          created_at: string | null
          id: string
          reason: string | null
          reported_by_member: string
          trip_id: string
        }
        Insert: {
          comment_id: number
          created_at?: string | null
          id?: string
          reason?: string | null
          reported_by_member: string
          trip_id: string
        }
        Update: {
          comment_id?: number
          created_at?: string | null
          id?: string
          reason?: string | null
          reported_by_member?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_reported_by_member_fkey"
            columns: ["reported_by_member"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          created_at: string | null
          experience_id: string | null
          id: number
          member_id: string | null
          text: string
          trip_id: string
          user_id: number | null
        }
        Insert: {
          created_at?: string | null
          experience_id?: string | null
          id?: number
          member_id?: string | null
          text: string
          trip_id: string
          user_id?: number | null
        }
        Update: {
          created_at?: string | null
          experience_id?: string | null
          id?: number
          member_id?: string | null
          text?: string
          trip_id?: string
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "comments_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          colour: string | null
          created_at: string
          credits: number | null
          id: string
          instructor: string | null
          name: string
          term: string
          workspace_id: string
        }
        Insert: {
          code: string
          colour?: string | null
          created_at?: string
          credits?: number | null
          id?: string
          instructor?: string | null
          name: string
          term: string
          workspace_id: string
        }
        Update: {
          code?: string
          colour?: string | null
          created_at?: string
          credits?: number | null
          id?: string
          instructor?: string | null
          name?: string
          term?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      derivation_sources: {
        Row: {
          derivation_id: string
          source_block_id: string
          source_text: string | null
          source_version: number
        }
        Insert: {
          derivation_id: string
          source_block_id: string
          source_text?: string | null
          source_version: number
        }
        Update: {
          derivation_id?: string
          source_block_id?: string
          source_text?: string | null
          source_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "derivation_sources_derivation_id_fkey"
            columns: ["derivation_id"]
            isOneToOne: false
            referencedRelation: "derivations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "derivation_sources_source_block_id_fkey"
            columns: ["source_block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      derivations: {
        Row: {
          computed_at: string | null
          derived_block_id: string
          error: string | null
          id: string
          model: string
          prompt_version: number
          recipe: string
          status: string
          workspace_id: string
        }
        Insert: {
          computed_at?: string | null
          derived_block_id: string
          error?: string | null
          id?: string
          model: string
          prompt_version?: number
          recipe: string
          status?: string
          workspace_id: string
        }
        Update: {
          computed_at?: string | null
          derived_block_id?: string
          error?: string | null
          id?: string
          model?: string
          prompt_version?: number
          recipe?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "derivations_derived_block_id_fkey"
            columns: ["derived_block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "derivations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      email_messages: {
        Row: {
          block_id: string | null
          created_at: string
          google_account_id: string
          id: string
          provider_msg_id: string
          received_at: string
          sender: string
          snippet: string | null
          subject: string | null
          thread_id: string
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          google_account_id: string
          id?: string
          provider_msg_id: string
          received_at: string
          sender: string
          snippet?: string | null
          subject?: string | null
          thread_id: string
        }
        Update: {
          block_id?: string | null
          created_at?: string
          google_account_id?: string
          id?: string
          provider_msg_id?: string
          received_at?: string
          sender?: string
          snippet?: string | null
          subject?: string | null
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_messages_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_messages_google_account_id_fkey"
            columns: ["google_account_id"]
            isOneToOne: false
            referencedRelation: "google_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      email_proposals: {
        Row: {
          confidence: number
          course_id: string | null
          created_at: string
          decided_at: string | null
          email_id: string
          fingerprint: string
          id: string
          kind: string
          meeting_id: string | null
          payload: Json
          status: string
          task_id: string | null
        }
        Insert: {
          confidence?: number
          course_id?: string | null
          created_at?: string
          decided_at?: string | null
          email_id: string
          fingerprint: string
          id?: string
          kind: string
          meeting_id?: string | null
          payload?: Json
          status?: string
          task_id?: string | null
        }
        Update: {
          confidence?: number
          course_id?: string | null
          created_at?: string
          decided_at?: string | null
          email_id?: string
          fingerprint?: string
          id?: string
          kind?: string
          meeting_id?: string | null
          payload?: Json
          status?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_proposals_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_proposals_email_id_fkey"
            columns: ["email_id"]
            isOneToOne: false
            referencedRelation: "email_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_proposals_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "class_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_proposals_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      experiences: {
        Row: {
          best_time: string | null
          booking_required: boolean
          catalog_place_id: string | null
          description: string | null
          duration_min: number | null
          hook: string | null
          id: string
          kid_note: string | null
          lat: number | null
          lng: number | null
          name: string
          nearest_town: string | null
          price_aed: string | null
          price_gel_max: number | null
          price_gel_min: number | null
          price_lari: string | null
          price_rupee: string | null
          region_id: string | null
          sort_order: number | null
          tags: string[] | null
          time_needed: string | null
          tips: string | null
          trip_id: string
        }
        Insert: {
          best_time?: string | null
          booking_required?: boolean
          catalog_place_id?: string | null
          description?: string | null
          duration_min?: number | null
          hook?: string | null
          id: string
          kid_note?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          nearest_town?: string | null
          price_aed?: string | null
          price_gel_max?: number | null
          price_gel_min?: number | null
          price_lari?: string | null
          price_rupee?: string | null
          region_id?: string | null
          sort_order?: number | null
          tags?: string[] | null
          time_needed?: string | null
          tips?: string | null
          trip_id: string
        }
        Update: {
          best_time?: string | null
          booking_required?: boolean
          catalog_place_id?: string | null
          description?: string | null
          duration_min?: number | null
          hook?: string | null
          id?: string
          kid_note?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          nearest_town?: string | null
          price_aed?: string | null
          price_gel_max?: number | null
          price_gel_min?: number | null
          price_lari?: string | null
          price_rupee?: string | null
          region_id?: string | null
          sort_order?: number | null
          tags?: string[] | null
          time_needed?: string | null
          tips?: string | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experiences_catalog_place_id_fkey"
            columns: ["catalog_place_id"]
            isOneToOne: false
            referencedRelation: "catalog_places"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_region_id_fkey"
            columns: ["region_id"]
            isOneToOne: false
            referencedRelation: "regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experiences_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          block_id: string | null
          course_id: string | null
          created_at: string
          id: string
          meeting_id: string | null
          mime_type: string | null
          name: string
          provider: string
          provider_id: string
          size_bytes: number | null
          thumbnail_link: string | null
          web_view_link: string | null
          workspace_id: string
        }
        Insert: {
          block_id?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          meeting_id?: string | null
          mime_type?: string | null
          name: string
          provider: string
          provider_id: string
          size_bytes?: number | null
          thumbnail_link?: string | null
          web_view_link?: string | null
          workspace_id: string
        }
        Update: {
          block_id?: string | null
          course_id?: string | null
          created_at?: string
          id?: string
          meeting_id?: string | null
          mime_type?: string | null
          name?: string
          provider?: string
          provider_id?: string
          size_bytes?: number | null
          thumbnail_link?: string | null
          web_view_link?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "class_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      google_accounts: {
        Row: {
          address: string
          created_at: string
          granted_scopes: string[]
          id: string
          last_history_id: string | null
          refresh_token_enc: string
          status: string
          synced_at: string | null
          user_id: string
        }
        Insert: {
          address: string
          created_at?: string
          granted_scopes?: string[]
          id?: string
          last_history_id?: string | null
          refresh_token_enc: string
          status?: string
          synced_at?: string | null
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          granted_scopes?: string[]
          id?: string
          last_history_id?: string | null
          refresh_token_enc?: string
          status?: string
          synced_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      itinerary_items: {
        Row: {
          created_at: string | null
          created_by: number | null
          created_by_member: string | null
          day: string
          duration_min: number
          experience_id: string | null
          id: string
          kind: string
          start_min: number
          title: string | null
          transport_mode: string | null
          trip_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: number | null
          created_by_member?: string | null
          day: string
          duration_min?: number
          experience_id?: string | null
          id: string
          kind: string
          start_min: number
          title?: string | null
          transport_mode?: string | null
          trip_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: number | null
          created_by_member?: string | null
          day?: string
          duration_min?: number
          experience_id?: string | null
          id?: string
          kind?: string
          start_min?: number
          title?: string | null
          transport_mode?: string | null
          trip_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "itinerary_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_created_by_member_fkey"
            columns: ["created_by_member"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "itinerary_items_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      periods: {
        Row: {
          created_at: string
          ends_at: string
          id: string
          label: string
          position: number
          starts_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          ends_at: string
          id?: string
          label: string
          position: number
          starts_at: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string
          id?: string
          label?: string
          position?: number
          starts_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "periods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      place_notes: {
        Row: {
          experience_id: string | null
          id: number
          text: string
          trip_id: string
          updated_at: string | null
          updated_by: number | null
          updated_by_member: string | null
        }
        Insert: {
          experience_id?: string | null
          id?: number
          text: string
          trip_id: string
          updated_at?: string | null
          updated_by?: number | null
          updated_by_member?: string | null
        }
        Update: {
          experience_id?: string | null
          id?: number
          text?: string
          trip_id?: string
          updated_at?: string | null
          updated_by?: number | null
          updated_by_member?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "place_notes_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: true
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_notes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "place_notes_updated_by_member_fkey"
            columns: ["updated_by_member"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          display_name: string | null
          emoji: string | null
          id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          emoji?: string | null
          id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          display_name?: string | null
          emoji?: string | null
          id?: string
        }
        Relationships: []
      }
      question_anchors: {
        Row: {
          anchored_block_id: string
          question_block_id: string
        }
        Insert: {
          anchored_block_id: string
          question_block_id: string
        }
        Update: {
          anchored_block_id?: string
          question_block_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_anchors_anchored_block_id_fkey"
            columns: ["anchored_block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_anchors_question_block_id_fkey"
            columns: ["question_block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          block_id: string
          created_at: string
          id: string
          status: string
          workspace_id: string
        }
        Insert: {
          block_id: string
          created_at?: string
          id?: string
          status?: string
          workspace_id: string
        }
        Update: {
          block_id?: string
          created_at?: string
          id?: string
          status?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "questions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ratings: {
        Row: {
          created_at: string | null
          experience_id: string | null
          id: number
          member_id: string | null
          rating: number | null
          trip_id: string
          updated_at: string | null
          user_id: number | null
        }
        Insert: {
          created_at?: string | null
          experience_id?: string | null
          id?: number
          member_id?: string | null
          rating?: number | null
          trip_id: string
          updated_at?: string | null
          user_id?: number | null
        }
        Update: {
          created_at?: string | null
          experience_id?: string | null
          id?: number
          member_id?: string | null
          rating?: number | null
          trip_id?: string
          updated_at?: string | null
          user_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ratings_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      regions: {
        Row: {
          base_towns: string | null
          catalog_region_id: string | null
          getting_there: string | null
          icon: string
          id: string
          is_selected: boolean
          name: string
          selected_at: string | null
          selected_by: string | null
          sort_order: number | null
          subtitle: string | null
          summary: string | null
          trip_id: string
          when_to_go: string | null
        }
        Insert: {
          base_towns?: string | null
          catalog_region_id?: string | null
          getting_there?: string | null
          icon?: string
          id: string
          is_selected?: boolean
          name: string
          selected_at?: string | null
          selected_by?: string | null
          sort_order?: number | null
          subtitle?: string | null
          summary?: string | null
          trip_id: string
          when_to_go?: string | null
        }
        Update: {
          base_towns?: string | null
          catalog_region_id?: string | null
          getting_there?: string | null
          icon?: string
          id?: string
          is_selected?: boolean
          name?: string
          selected_at?: string | null
          selected_by?: string | null
          sort_order?: number | null
          subtitle?: string | null
          summary?: string | null
          trip_id?: string
          when_to_go?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "regions_catalog_region_id_fkey"
            columns: ["catalog_region_id"]
            isOneToOne: false
            referencedRelation: "catalog_regions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_selected_by_fkey"
            columns: ["selected_by"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "regions_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      sessions: {
        Row: {
          course_id: string
          created_at: string
          ends_at: string
          id: string
          is_lab: boolean
          period_id: string | null
          room: string | null
          starts_at: string
          valid_from: string | null
          valid_until: string | null
          weekday: number
        }
        Insert: {
          course_id: string
          created_at?: string
          ends_at: string
          id?: string
          is_lab?: boolean
          period_id?: string | null
          room?: string | null
          starts_at: string
          valid_from?: string | null
          valid_until?: string | null
          weekday: number
        }
        Update: {
          course_id?: string
          created_at?: string
          ends_at?: string
          id?: string
          is_lab?: boolean
          period_id?: string | null
          room?: string | null
          starts_at?: string
          valid_from?: string | null
          valid_until?: string | null
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_period_id_fkey"
            columns: ["period_id"]
            isOneToOne: false
            referencedRelation: "periods"
            referencedColumns: ["id"]
          },
        ]
      }
      standalone_notes: {
        Row: {
          block_id: string
          course_id: string | null
          created_at: string
          id: string
          unit_id: string | null
          workspace_id: string
        }
        Insert: {
          block_id: string
          course_id?: string | null
          created_at?: string
          id?: string
          unit_id?: string | null
          workspace_id: string
        }
        Update: {
          block_id?: string
          course_id?: string | null
          created_at?: string
          id?: string
          unit_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "standalone_notes_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_notes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_notes_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "syllabus_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standalone_notes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      study_sessions: {
        Row: {
          course_id: string
          created_at: string
          ended_at: string
          focus_rating: number | null
          id: string
          started_at: string
          unit_id: string | null
          workspace_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          ended_at: string
          focus_rating?: number | null
          id?: string
          started_at: string
          unit_id?: string | null
          workspace_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          ended_at?: string
          focus_rating?: number | null
          id?: string
          started_at?: string
          unit_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "syllabus_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "study_sessions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      syllabus_units: {
        Row: {
          block_id: string | null
          course_id: string
          created_at: string
          id: string
          position: number
          status: string
          title: string
        }
        Insert: {
          block_id?: string | null
          course_id: string
          created_at?: string
          id?: string
          position: number
          status?: string
          title: string
        }
        Update: {
          block_id?: string | null
          course_id?: string
          created_at?: string
          id?: string
          position?: number
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "syllabus_units_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "syllabus_units_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          course_id: string | null
          created_at: string
          due_at: string | null
          effort_min: number | null
          id: string
          meeting_id: string | null
          notes: string | null
          source_block_id: string | null
          status: string
          title: string
          unit_id: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          due_at?: string | null
          effort_min?: number | null
          id?: string
          meeting_id?: string | null
          notes?: string | null
          source_block_id?: string | null
          status?: string
          title: string
          unit_id?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          due_at?: string | null
          effort_min?: number | null
          id?: string
          meeting_id?: string | null
          notes?: string | null
          source_block_id?: string | null
          status?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_meeting_id_fkey"
            columns: ["meeting_id"]
            isOneToOne: false
            referencedRelation: "class_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_source_block_id_fkey"
            columns: ["source_block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "syllabus_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code: string
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string
          invited_by: string | null
          role: string
          trip_id: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          trip_id: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string
          invited_by?: string | null
          role?: string
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_invites_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_members: {
        Row: {
          created_at: string | null
          display_name: string
          emoji: string
          id: string
          is_adult: boolean
          joined_at: string | null
          legacy_user_id: number | null
          managed_by: string | null
          member_kind: string
          role: string
          status: string
          trip_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          display_name: string
          emoji?: string
          id?: string
          is_adult?: boolean
          joined_at?: string | null
          legacy_user_id?: number | null
          managed_by?: string | null
          member_kind?: string
          role?: string
          status?: string
          trip_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          display_name?: string
          emoji?: string
          id?: string
          is_adult?: boolean
          joined_at?: string | null
          legacy_user_id?: number | null
          managed_by?: string | null
          member_kind?: string
          role?: string
          status?: string
          trip_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_members_managed_by_fkey"
            columns: ["managed_by"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_members_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_notes: {
        Row: {
          id: number
          text: string
          trip_id: string
          updated_at: string | null
          updated_by: number | null
          updated_by_member: string | null
        }
        Insert: {
          id: number
          text: string
          trip_id: string
          updated_at?: string | null
          updated_by?: number | null
          updated_by_member?: string | null
        }
        Update: {
          id?: number
          text?: string
          trip_id?: string
          updated_at?: string | null
          updated_by?: number | null
          updated_by_member?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trip_notes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_notes_updated_by_member_fkey"
            columns: ["updated_by_member"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          cover_emoji: string | null
          created_at: string | null
          created_by: string | null
          destination: string | null
          end_date: string | null
          id: string
          name: string
          start_date: string | null
          updated_at: string | null
        }
        Insert: {
          cover_emoji?: string | null
          created_at?: string | null
          created_by?: string | null
          destination?: string | null
          end_date?: string | null
          id?: string
          name: string
          start_date?: string | null
          updated_at?: string | null
        }
        Update: {
          cover_emoji?: string | null
          created_at?: string | null
          created_by?: string | null
          destination?: string | null
          end_date?: string | null
          id?: string
          name?: string
          start_date?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string | null
          emoji: string
          id: number
          is_adult: boolean
          name: string
        }
        Insert: {
          created_at?: string | null
          emoji?: string
          id?: number
          is_adult?: boolean
          name: string
        }
        Update: {
          created_at?: string | null
          emoji?: string
          id?: number
          is_adult?: boolean
          name?: string
        }
        Relationships: []
      }
      votes: {
        Row: {
          created_at: string | null
          experience_id: string | null
          id: number
          member_id: string | null
          trip_id: string
          updated_at: string | null
          user_id: number | null
          vote: string | null
        }
        Insert: {
          created_at?: string | null
          experience_id?: string | null
          id?: number
          member_id?: string | null
          trip_id: string
          updated_at?: string | null
          user_id?: number | null
          vote?: string | null
        }
        Update: {
          created_at?: string | null
          experience_id?: string | null
          id?: number
          member_id?: string | null
          trip_id?: string
          updated_at?: string | null
          user_id?: number | null
          vote?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "votes_experience_id_fkey"
            columns: ["experience_id"]
            isOneToOne: false
            referencedRelation: "experiences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "trip_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
          term_end: string | null
          term_start: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          owner_id: string
          term_end?: string | null
          term_start?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          term_end?: string | null
          term_start?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      current_block_embeddings: {
        Row: {
          block_id: string | null
          created_at: string | null
          embedding: string | null
          model: string | null
          version: number | null
          workspace_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "block_embeddings_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_comment: {
        Args: {
          p_experience_id: string
          p_member_id: string
          p_text: string
          p_trip_id: string
        }
        Returns: number
      }
      add_experience: {
        Args: {
          p_description: string
          p_id: string
          p_name: string
          p_price_lari: string
          p_region_id: string
          p_time_needed: string
          p_trip_id: string
        }
        Returns: undefined
      }
      add_itinerary_item: {
        Args: {
          p_created_by_member: string
          p_day: string
          p_duration_min: number
          p_experience_id: string
          p_id: string
          p_kind: string
          p_notes: string
          p_start_min: number
          p_title: string
          p_transport_mode: string
          p_trip_id: string
        }
        Returns: undefined
      }
      add_region: {
        Args: {
          p_icon: string
          p_id: string
          p_name: string
          p_sort_order: number
          p_subtitle: string
          p_trip_id: string
        }
        Returns: undefined
      }
      block_member: {
        Args: {
          p_blocked_member_id: string
          p_blocker_member_id: string
          p_trip_id: string
        }
        Returns: undefined
      }
      block_plain_text: { Args: { content: Json }; Returns: string }
      create_georgia_trip: {
        Args: {
          p_end_date: string
          p_name: string
          p_region_ids?: string[]
          p_start_date: string
        }
        Returns: string
      }
      create_trip: {
        Args: {
          p_destination: string
          p_end_date: string
          p_name: string
          p_start_date: string
        }
        Returns: string
      }
      delete_comment: { Args: { p_comment_id: number }; Returns: undefined }
      delete_itinerary_item: { Args: { p_id: string }; Returns: undefined }
      delete_own_account: { Args: never; Returns: undefined }
      delete_stale_embeddings: {
        Args: { p_workspace_id: string }
        Returns: number
      }
      dismiss_report: { Args: { p_report_id: string }; Returns: undefined }
      grant_calendar_access: {
        Args: { p_member_id: string; p_trip_id: string }
        Returns: undefined
      }
      pending_embeddings: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: {
          block_id: string
          plain_text: string
          version: number
        }[]
      }
      redeem_trip_invite: { Args: { p_code: string }; Returns: string }
      remove_trip_member: { Args: { p_member_id: string }; Returns: undefined }
      report_comment: {
        Args: {
          p_comment_id: number
          p_reason: string
          p_reporter_member_id: string
          p_trip_id: string
        }
        Returns: undefined
      }
      revoke_calendar_access: {
        Args: { p_member_id: string; p_trip_id: string }
        Returns: undefined
      }
      search_blocks: {
        Args: {
          p_embedding?: string
          p_limit?: number
          p_query: string
          p_workspace_id: string
        }
        Returns: {
          block_id: string
          block_type: string
          lexical: boolean
          parent_id: string
          plain_text: string
          score: number
          semantic: boolean
          version: number
        }[]
      }
      seed_trip_catalog: {
        Args: { p_region_ids?: string[]; p_trip_id: string }
        Returns: number
      }
      set_trip_region_selected: {
        Args: { p_region_id: string; p_selected: boolean }
        Returns: undefined
      }
      unblock_member: {
        Args: { p_blocked_member_id: string; p_blocker_member_id: string }
        Returns: undefined
      }
      update_itinerary_item: {
        Args: {
          p_day: string
          p_duration_min: number
          p_id: string
          p_notes: string
          p_start_min: number
          p_title: string
        }
        Returns: undefined
      }
      update_member_role: {
        Args: { p_member_id: string; p_next_role: string }
        Returns: undefined
      }
      update_own_profile: {
        Args: { p_display_name: string }
        Returns: undefined
      }
      upsert_place_note: {
        Args: {
          p_experience_id: string
          p_member_id: string
          p_text: string
          p_trip_id: string
        }
        Returns: undefined
      }
      upsert_rating: {
        Args: {
          p_experience_id: string
          p_member_id: string
          p_rating: number
          p_trip_id: string
        }
        Returns: undefined
      }
      upsert_trip_note: {
        Args: { p_member_id: string; p_text: string; p_trip_id: string }
        Returns: undefined
      }
      upsert_vote: {
        Args: {
          p_experience_id: string
          p_member_id: string
          p_trip_id: string
          p_vote: string
        }
        Returns: undefined
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
