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
    PostgrestVersion: "14.17"
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
      sessions: {
        Row: {
          course_id: string
          created_at: string
          ends_at: string
          id: string
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
      workspaces: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name?: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
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
      block_plain_text: { Args: { content: Json }; Returns: string }
      delete_stale_embeddings: {
        Args: { p_workspace_id: string }
        Returns: number
      }
      pending_embeddings: {
        Args: { p_limit?: number; p_workspace_id: string }
        Returns: {
          block_id: string
          plain_text: string
          version: number
        }[]
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
