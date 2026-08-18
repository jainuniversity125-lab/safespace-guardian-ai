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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      appeals: {
        Row: {
          appellant_id: string
          created_at: string
          decision_id: string
          id: string
          reason: string
          resolution: string | null
          resolved_at: string | null
          reviewer_id: string | null
          status: string
        }
        Insert: {
          appellant_id: string
          created_at?: string
          decision_id: string
          id?: string
          reason: string
          resolution?: string | null
          resolved_at?: string | null
          reviewer_id?: string | null
          status?: string
        }
        Update: {
          appellant_id?: string
          created_at?: string
          decision_id?: string
          id?: string
          reason?: string
          resolution?: string | null
          resolved_at?: string | null
          reviewer_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appeals_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "moderation_decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          actor_id: string | null
          created_at: string
          details: Json
          event_type: string
          id: string
          object_id: string | null
          object_type: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type: string
          id?: string
          object_id?: string | null
          object_type: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          details?: Json
          event_type?: string
          id?: string
          object_id?: string | null
          object_type?: string
        }
        Relationships: []
      }
      benchmark_results: {
        Row: {
          confidence: number
          correct: boolean
          created_at: string
          expected_bullying: boolean
          expected_category: string
          final_risk: number
          id: string
          language: string
          predicted_bullying: boolean
          predicted_category: string
          predicted_severity: Database["public"]["Enums"]["severity_level"]
          run_id: string
          sample_id: string | null
          script_mix: string
          text_preview: string
        }
        Insert: {
          confidence?: number
          correct?: boolean
          created_at?: string
          expected_bullying?: boolean
          expected_category?: string
          final_risk?: number
          id?: string
          language?: string
          predicted_bullying?: boolean
          predicted_category?: string
          predicted_severity?: Database["public"]["Enums"]["severity_level"]
          run_id: string
          sample_id?: string | null
          script_mix?: string
          text_preview?: string
        }
        Update: {
          confidence?: number
          correct?: boolean
          created_at?: string
          expected_bullying?: boolean
          expected_category?: string
          final_risk?: number
          id?: string
          language?: string
          predicted_bullying?: boolean
          predicted_category?: string
          predicted_severity?: Database["public"]["Enums"]["severity_level"]
          run_id?: string
          sample_id?: string | null
          script_mix?: string
          text_preview?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_results_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "benchmark_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "benchmark_results_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "dataset_samples"
            referencedColumns: ["id"]
          },
        ]
      }
      benchmark_runs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          dataset_id: string
          error: string | null
          id: string
          metrics: Json
          mode: string
          model_version: string
          sample_size: number
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          dataset_id: string
          error?: string | null
          id?: string
          metrics?: Json
          mode?: string
          model_version?: string
          sample_size?: number
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          dataset_id?: string
          error?: string | null
          id?: string
          metrics?: Json
          mode?: string
          model_version?: string
          sample_size?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "benchmark_runs_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
          mode: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
          mode?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
          mode?: string
        }
        Relationships: []
      }
      content_items: {
        Row: {
          author_id: string
          body: string
          content_type: string
          conversation_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          language: string
          media_url: string | null
          requires_review: boolean
          severity: Database["public"]["Enums"]["severity_level"]
          visibility_status: string
        }
        Insert: {
          author_id: string
          body: string
          content_type?: string
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          language?: string
          media_url?: string | null
          requires_review?: boolean
          severity?: Database["public"]["Enums"]["severity_level"]
          visibility_status?: string
        }
        Update: {
          author_id?: string
          body?: string
          content_type?: string
          conversation_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          language?: string
          media_url?: string | null
          requires_review?: boolean
          severity?: Database["public"]["Enums"]["severity_level"]
          visibility_status?: string
        }
        Relationships: []
      }
      dataset_samples: {
        Row: {
          created_at: string
          dataset_id: string
          expected_bullying: boolean
          expected_category: string
          expected_severity: Database["public"]["Enums"]["severity_level"]
          id: string
          language: string
          notes: string | null
          script_mix: string
          text: string
        }
        Insert: {
          created_at?: string
          dataset_id: string
          expected_bullying?: boolean
          expected_category?: string
          expected_severity?: Database["public"]["Enums"]["severity_level"]
          id?: string
          language?: string
          notes?: string | null
          script_mix?: string
          text: string
        }
        Update: {
          created_at?: string
          dataset_id?: string
          expected_bullying?: boolean
          expected_category?: string
          expected_severity?: Database["public"]["Enums"]["severity_level"]
          id?: string
          language?: string
          notes?: string | null
          script_mix?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "dataset_samples_dataset_id_fkey"
            columns: ["dataset_id"]
            isOneToOne: false
            referencedRelation: "datasets"
            referencedColumns: ["id"]
          },
        ]
      }
      datasets: {
        Row: {
          created_at: string
          description: string | null
          id: string
          languages: Json
          name: string
          owner_id: string
          sample_count: number
          source_note: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          languages?: Json
          name: string
          owner_id: string
          sample_count?: number
          source_note?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          languages?: Json
          name?: string
          owner_id?: string
          sample_count?: number
          source_note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fewshot_examples: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          expected_bullying: boolean
          expected_category: string
          expected_severity: Database["public"]["Enums"]["severity_level"]
          id: string
          language: string
          rationale: string | null
          sample_id: string | null
          script_mix: string
          text: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expected_bullying?: boolean
          expected_category?: string
          expected_severity?: Database["public"]["Enums"]["severity_level"]
          id?: string
          language?: string
          rationale?: string | null
          sample_id?: string | null
          script_mix?: string
          text: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          expected_bullying?: boolean
          expected_category?: string
          expected_severity?: Database["public"]["Enums"]["severity_level"]
          id?: string
          language?: string
          rationale?: string | null
          sample_id?: string | null
          script_mix?: string
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "fewshot_examples_sample_id_fkey"
            columns: ["sample_id"]
            isOneToOne: false
            referencedRelation: "dataset_samples"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_sources: {
        Row: {
          active: boolean
          created_at: string
          created_by: string | null
          event_count: number
          id: string
          last_event_at: string | null
          name: string
          platform: string
          signing_secret: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          event_count?: number
          id?: string
          last_event_at?: string | null
          name: string
          platform?: string
          signing_secret: string
        }
        Update: {
          active?: boolean
          created_at?: string
          created_by?: string | null
          event_count?: number
          id?: string
          last_event_at?: string | null
          name?: string
          platform?: string
          signing_secret?: string
        }
        Relationships: []
      }
      ingested_posts: {
        Row: {
          author_handle: string
          body: string
          confidence: number
          created_at: string
          explanation: Json
          external_id: string | null
          final_risk: number
          id: string
          labels: Json
          language: string
          media_url: string | null
          model_version: string | null
          platform: string
          recommended_action: string
          requires_review: boolean
          severity: Database["public"]["Enums"]["severity_level"]
          source_id: string | null
          status: string
          target_handle: string | null
        }
        Insert: {
          author_handle?: string
          body: string
          confidence?: number
          created_at?: string
          explanation?: Json
          external_id?: string | null
          final_risk?: number
          id?: string
          labels?: Json
          language?: string
          media_url?: string | null
          model_version?: string | null
          platform?: string
          recommended_action?: string
          requires_review?: boolean
          severity?: Database["public"]["Enums"]["severity_level"]
          source_id?: string | null
          status?: string
          target_handle?: string | null
        }
        Update: {
          author_handle?: string
          body?: string
          confidence?: number
          created_at?: string
          explanation?: Json
          external_id?: string | null
          final_risk?: number
          id?: string
          labels?: Json
          language?: string
          media_url?: string | null
          model_version?: string | null
          platform?: string
          recommended_action?: string
          requires_review?: boolean
          severity?: Database["public"]["Enums"]["severity_level"]
          source_id?: string | null
          status?: string
          target_handle?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ingested_posts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "ingest_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      media_evidence: {
        Row: {
          analysis: Json
          content_id: string | null
          created_at: string
          duration_ms: number | null
          file_size: number
          id: string
          job_attempts: number
          job_completed_at: string | null
          job_error: string | null
          job_started_at: string | null
          job_status: string
          legal_hold: boolean
          media_kind: string
          mime_type: string
          model_version: string | null
          ocr_confidence: number
          ocr_text: string | null
          report_id: string | null
          segments: Json
          severity: Database["public"]["Enums"]["severity_level"]
          status: string
          storage_path: string
          transcript: string | null
          transcript_confidence: number
          updated_at: string
          uploader_id: string
        }
        Insert: {
          analysis?: Json
          content_id?: string | null
          created_at?: string
          duration_ms?: number | null
          file_size?: number
          id?: string
          job_attempts?: number
          job_completed_at?: string | null
          job_error?: string | null
          job_started_at?: string | null
          job_status?: string
          legal_hold?: boolean
          media_kind?: string
          mime_type?: string
          model_version?: string | null
          ocr_confidence?: number
          ocr_text?: string | null
          report_id?: string | null
          segments?: Json
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: string
          storage_path: string
          transcript?: string | null
          transcript_confidence?: number
          updated_at?: string
          uploader_id: string
        }
        Update: {
          analysis?: Json
          content_id?: string | null
          created_at?: string
          duration_ms?: number | null
          file_size?: number
          id?: string
          job_attempts?: number
          job_completed_at?: string | null
          job_error?: string | null
          job_started_at?: string | null
          job_status?: string
          legal_hold?: boolean
          media_kind?: string
          mime_type?: string
          model_version?: string | null
          ocr_confidence?: number
          ocr_text?: string | null
          report_id?: string | null
          segments?: Json
          severity?: Database["public"]["Enums"]["severity_level"]
          status?: string
          storage_path?: string
          transcript?: string | null
          transcript_confidence?: number
          updated_at?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "media_evidence_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "media_evidence_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      model_predictions: {
        Row: {
          confidence: number
          content_id: string
          created_at: string
          explanation: Json
          final_risk: number
          id: string
          labels: Json
          model_version: string
          recommended_action: string
          repetition_score: number
          requires_review: boolean
          severity: Database["public"]["Enums"]["severity_level"]
          target_detected: boolean
        }
        Insert: {
          confidence?: number
          content_id: string
          created_at?: string
          explanation?: Json
          final_risk?: number
          id?: string
          labels?: Json
          model_version: string
          recommended_action?: string
          repetition_score?: number
          requires_review?: boolean
          severity?: Database["public"]["Enums"]["severity_level"]
          target_detected?: boolean
        }
        Update: {
          confidence?: number
          content_id?: string
          created_at?: string
          explanation?: Json
          final_risk?: number
          id?: string
          labels?: Json
          model_version?: string
          recommended_action?: string
          repetition_score?: number
          requires_review?: boolean
          severity?: Database["public"]["Enums"]["severity_level"]
          target_detected?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "model_predictions_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      moderation_decisions: {
        Row: {
          action_taken: string | null
          content_id: string | null
          created_at: string
          decision: string
          id: string
          moderator_id: string
          policy_code: string | null
          reason: string | null
          report_id: string | null
        }
        Insert: {
          action_taken?: string | null
          content_id?: string | null
          created_at?: string
          decision: string
          id?: string
          moderator_id: string
          policy_code?: string | null
          reason?: string | null
          report_id?: string | null
        }
        Update: {
          action_taken?: string | null
          content_id?: string | null
          created_at?: string
          decision?: string
          id?: string
          moderator_id?: string
          policy_code?: string | null
          reason?: string | null
          report_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_decisions_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_decisions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_reads: {
        Row: {
          id: string
          notification_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          id?: string
          notification_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          id?: string
          notification_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_reads_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          audience: string
          body: string | null
          created_at: string
          id: string
          kind: string
          object_id: string | null
          object_type: string
          severity: Database["public"]["Enums"]["severity_level"]
          title: string
          user_id: string | null
        }
        Insert: {
          audience?: string
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          object_id?: string | null
          object_type?: string
          severity?: Database["public"]["Enums"]["severity_level"]
          title: string
          user_id?: string | null
        }
        Update: {
          audience?: string
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          object_id?: string | null
          object_type?: string
          severity?: Database["public"]["Enums"]["severity_level"]
          title?: string
          user_id?: string | null
        }
        Relationships: []
      }
      privacy_requests: {
        Row: {
          confirmation_code: string
          confirmed_at: string | null
          created_at: string
          id: string
          model_versions: Json
          outcome_note: string | null
          policy_version: string | null
          preserved_evidence: Json
          processed_at: string | null
          processed_by: string | null
          reason: string | null
          receipt_code: string | null
          redaction_summary: Json
          request_type: string
          scope: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confirmation_code: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          model_versions?: Json
          outcome_note?: string | null
          policy_version?: string | null
          preserved_evidence?: Json
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          receipt_code?: string | null
          redaction_summary?: Json
          request_type?: string
          scope?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confirmation_code?: string
          confirmed_at?: string | null
          created_at?: string
          id?: string
          model_versions?: Json
          outcome_note?: string | null
          policy_version?: string | null
          preserved_evidence?: Json
          processed_at?: string | null
          processed_by?: string | null
          reason?: string | null
          receipt_code?: string | null
          redaction_summary?: Json
          request_type?: string
          scope?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_status: string
          age_band: string
          consent_status: boolean
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          account_status?: string
          age_band?: string
          consent_status?: boolean
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          account_status?: string
          age_band?: string
          consent_status?: boolean
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          assigned_moderator_id: string | null
          category: string
          closed_at: string | null
          content_id: string | null
          created_at: string
          description: string | null
          evidence_url: string | null
          id: string
          priority: Database["public"]["Enums"]["severity_level"]
          reporter_id: string
          status: string
        }
        Insert: {
          assigned_moderator_id?: string | null
          category: string
          closed_at?: string | null
          content_id?: string | null
          created_at?: string
          description?: string | null
          evidence_url?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["severity_level"]
          reporter_id: string
          status?: string
        }
        Update: {
          assigned_moderator_id?: string | null
          category?: string
          closed_at?: string | null
          content_id?: string | null
          created_at?: string
          description?: string | null
          evidence_url?: string | null
          id?: string
          priority?: Database["public"]["Enums"]["severity_level"]
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "content_items"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_lab: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role:
        | "user"
        | "moderator"
        | "admin"
        | "auditor"
        | "counselor"
        | "data_scientist"
      severity_level: "safe" | "low" | "medium" | "high" | "critical"
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
      app_role: [
        "user",
        "moderator",
        "admin",
        "auditor",
        "counselor",
        "data_scientist",
      ],
      severity_level: ["safe", "low", "medium", "high", "critical"],
    },
  },
} as const
