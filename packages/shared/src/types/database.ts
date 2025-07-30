export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
          operationName?: string
          query?: string
          variables?: Json
          extensions?: Json
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
      episode_transcript_notes: {
        Row: {
          created_at: string
          deleted_at: string | null
          episode_id: string
          error_message: string | null
          id: string
          input_tokens: number | null
          model: string | null
          notes: string | null
          output_tokens: number | null
          status: string | null
          transcript_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          episode_id: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          notes?: string | null
          output_tokens?: number | null
          status?: string | null
          transcript_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          episode_id?: string
          error_message?: string | null
          id?: string
          input_tokens?: number | null
          model?: string | null
          notes?: string | null
          output_tokens?: number | null
          status?: string | null
          transcript_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "episode_transcript_notes_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: true
            referencedRelation: "podcast_episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "episode_transcript_notes_transcript_id_fkey"
            columns: ["transcript_id"]
            isOneToOne: false
            referencedRelation: "transcripts"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_edition_episodes: {
        Row: {
          created_at: string
          episode_id: string
          id: string
          newsletter_edition_id: string
        }
        Insert: {
          created_at?: string
          episode_id: string
          id?: string
          newsletter_edition_id: string
        }
        Update: {
          created_at?: string
          episode_id?: string
          id?: string
          newsletter_edition_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_edition_episodes_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episode_transcript_notes"
            referencedColumns: ["episode_id"]
          },
          {
            foreignKeyName: "newsletter_edition_episodes_newsletter_edition_id_fkey"
            columns: ["newsletter_edition_id"]
            isOneToOne: false
            referencedRelation: "newsletter_editions"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_editions: {
        Row: {
          content: string | null
          created_at: string
          deleted_at: string | null
          edition_date: string
          error_message: string | null
          id: string
          model: string | null
          sent_at: string | null
          status: string
          subject_line: string | null
          updated_at: string
          user_email: string
          user_id: string
        }
        Insert: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edition_date: string
          error_message?: string | null
          id?: string
          model?: string | null
          sent_at?: string | null
          status: string
          subject_line?: string | null
          updated_at?: string
          user_email: string
          user_id: string
        }
        Update: {
          content?: string | null
          created_at?: string
          deleted_at?: string | null
          edition_date?: string
          error_message?: string | null
          id?: string
          model?: string | null
          sent_at?: string | null
          status?: string
          subject_line?: string | null
          updated_at?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      podcast_episodes: {
        Row: {
          created_at: string | null
          description: string | null
          duration_sec: number | null
          episode_url: string
          guid: string
          id: string
          pub_date: string | null
          show_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration_sec?: number | null
          episode_url: string
          guid: string
          id?: string
          pub_date?: string | null
          show_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration_sec?: number | null
          episode_url?: string
          guid?: string
          id?: string
          pub_date?: string | null
          show_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "podcast_episodes_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "podcast_shows"
            referencedColumns: ["id"]
          },
        ]
      }
      podcast_shows: {
        Row: {
          created_at: string
          description: string | null
          etag: string | null
          id: string
          image_url: string | null
          last_checked_episodes: string | null
          last_fetched: string | null
          last_modified: string | null
          last_updated: string | null
          rss_url: string
          spotify_url: string | null
          title: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          etag?: string | null
          id?: string
          image_url?: string | null
          last_checked_episodes?: string | null
          last_fetched?: string | null
          last_modified?: string | null
          last_updated?: string | null
          rss_url: string
          spotify_url?: string | null
          title?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          etag?: string | null
          id?: string
          image_url?: string | null
          last_checked_episodes?: string | null
          last_fetched?: string | null
          last_modified?: string | null
          last_updated?: string | null
          rss_url?: string
          spotify_url?: string | null
          title?: string | null
        }
        Relationships: []
      }
      supabase_migrations: {
        Row: {
          applied_at: string
          checksum: string | null
          version: string
        }
        Insert: {
          applied_at?: string
          checksum?: string | null
          version: string
        }
        Update: {
          applied_at?: string
          checksum?: string | null
          version?: string
        }
        Relationships: []
      }
      transcripts: {
        Row: {
          created_at: string | null
          current_status: string
          deleted_at: string | null
          episode_id: string
          error_details: string | null
          id: string
          initial_status: string
          is_taddy_exclusive: boolean | null
          source: string | null
          storage_path: string | null
          updated_at: string | null
          word_count: number | null
        }
        Insert: {
          created_at?: string | null
          current_status: string
          deleted_at?: string | null
          episode_id: string
          error_details?: string | null
          id?: string
          initial_status: string
          is_taddy_exclusive?: boolean | null
          source?: string | null
          storage_path?: string | null
          updated_at?: string | null
          word_count?: number | null
        }
        Update: {
          created_at?: string | null
          current_status?: string
          deleted_at?: string | null
          episode_id?: string
          error_details?: string | null
          id?: string
          initial_status?: string
          is_taddy_exclusive?: boolean | null
          source?: string | null
          storage_path?: string | null
          updated_at?: string | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transcripts_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: true
            referencedRelation: "podcast_episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_podcast_subscriptions: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          show_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          subscription_source: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          show_id: string
          status?: Database["public"]["Enums"]["subscription_status"]
          subscription_source?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          show_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          subscription_source?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "podcast_subscriptions_show_id_fkey"
            columns: ["show_id"]
            isOneToOne: false
            referencedRelation: "podcast_shows"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "podcast_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          auth_provider: string
          created_at: string
          email: string | null
          google_id: string | null
          id: string
          spotify_id: string | null
          spotify_reauth_required: boolean | null
          spotify_tokens_enc: string | null
          updated_at: string
        }
        Insert: {
          auth_provider?: string
          created_at?: string
          email?: string | null
          google_id?: string | null
          id?: string
          spotify_id?: string | null
          spotify_reauth_required?: boolean | null
          spotify_tokens_enc?: string | null
          updated_at?: string
        }
        Update: {
          auth_provider?: string
          created_at?: string
          email?: string | null
          google_id?: string | null
          id?: string
          spotify_id?: string | null
          spotify_reauth_required?: boolean | null
          spotify_tokens_enc?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_token_refresh_transaction: {
        Args: { p_user_id: string }
        Returns: {
          user_id: string
          locked: boolean
        }[]
      }
      get_encrypted_tokens: {
        Args: { p_user_id: string; p_encryption_key: string }
        Returns: Json
      }
      migrate_spotify_tokens_to_vault: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      pg_advisory_unlock: {
        Args: { key: string }
        Returns: boolean
      }
      pg_try_advisory_lock: {
        Args: { key: string }
        Returns: boolean
      }
      test_encryption: {
        Args: { test_data: string; encryption_key: string }
        Returns: string
      }
      test_vault_count: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      test_vault_delete: {
        Args: { secret_id: string }
        Returns: boolean
      }
      test_vault_insert: {
        Args: { secret_name: string; secret_data: string }
        Returns: string
      }
      test_vault_operations: {
        Args: Record<PropertyKey, never>
        Returns: {
          test_name: string
          success: boolean
          message: string
        }[]
      }
      test_vault_read: {
        Args: { secret_id: string }
        Returns: string
      }
      update_encrypted_tokens: {
        Args: {
          p_user_id: string
          p_token_data: Json
          p_encryption_key: string
        }
        Returns: undefined
      }
      validate_spotify_token_migration: {
        Args: Record<PropertyKey, never>
        Returns: {
          total_users: number
          users_with_tokens: number
          users_migrated: number
          users_requiring_reauth: number
          migration_success_rate: number
        }[]
      }
      validate_token_migration_completion: {
        Args: Record<PropertyKey, never>
        Returns: {
          columns_exist: boolean
          vault_users_count: number
          validation_passed: boolean
        }[]
      }
      vault_create_user_secret: {
        Args: {
          p_secret_name: string
          p_secret_data: string
          p_description?: string
        }
        Returns: string
      }
      vault_delete_user_secret: {
        Args: { p_secret_id: string }
        Returns: boolean
      }
      vault_read_user_secret: {
        Args: { p_secret_id: string }
        Returns: string
      }
      vault_update_user_secret: {
        Args: { p_secret_id: string; p_secret_data: string }
        Returns: boolean
      }
    }
    Enums: {
      subscription_status: "active" | "inactive"
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
    Enums: {
      subscription_status: ["active", "inactive"],
    },
  },
} as const

