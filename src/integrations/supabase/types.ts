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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          balance: number
          color: string | null
          created_at: string
          created_by: string
          household_id: string
          icon: string | null
          id: string
          is_active: boolean
          name: string
          type: string
          updated_at: string
        }
        Insert: {
          balance?: number
          color?: string | null
          created_at?: string
          created_by: string
          household_id: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          type?: string
          updated_at?: string
        }
        Update: {
          balance?: number
          color?: string | null
          created_at?: string
          created_by?: string
          household_id?: string
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action_type: string
          admin_user_id: string
          created_at: string
          id: string
          metadata: Json | null
          target_id: string | null
          target_type: string
        }
        Insert: {
          action_type: string
          admin_user_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type: string
        }
        Update: {
          action_type?: string
          admin_user_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          target_id?: string | null
          target_type?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          amount: number
          created_at: string
          end_date: string
          household_id: string | null
          id: string
          period_type: string
          start_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          end_date: string
          household_id?: string | null
          id?: string
          period_type?: string
          start_date: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          end_date?: string
          household_id?: string | null
          id?: string
          period_type?: string
          start_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string
          created_at: string
          household_id: string | null
          icon: string
          id: string
          is_system: boolean
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          household_id?: string | null
          icon?: string
          id?: string
          is_system?: boolean
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          household_id?: string | null
          icon?: string
          id?: string
          is_system?: boolean
          name?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          days_granted_snapshot: number
          household_id: string
          id: string
          redeemed_at: string
          redeemed_by_user_id: string
        }
        Insert: {
          coupon_id: string
          days_granted_snapshot: number
          household_id: string
          id?: string
          redeemed_at?: string
          redeemed_by_user_id: string
        }
        Update: {
          coupon_id?: string
          days_granted_snapshot?: number
          household_id?: string
          id?: string
          redeemed_at?: string
          redeemed_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          created_by_admin_id: string
          days_granted: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_redemptions: number | null
          notes: string | null
          redeemed_count: number
          type: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by_admin_id: string
          days_granted?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          notes?: string | null
          redeemed_count?: number
          type?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by_admin_id?: string
          days_granted?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_redemptions?: number | null
          notes?: string | null
          redeemed_count?: number
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_members: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          household_id: string | null
          household_owner_id: string
          id: string
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          household_id?: string | null
          household_owner_id: string
          id?: string
          name: string
          role?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          household_id?: string | null
          household_owner_id?: string
          id?: string
          name?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "family_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_invites: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string
          household_id: string
          id: string
          is_active: boolean | null
          max_uses: number | null
          uses_count: number | null
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string
          household_id: string
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          uses_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          household_id?: string
          id?: string
          is_active?: boolean | null
          max_uses?: number | null
          uses_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "household_invites_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_join_requests: {
        Row: {
          created_at: string
          household_id: string
          id: string
          invite_id: string | null
          requested_at: string
          responded_at: string | null
          responded_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          invite_id?: string | null
          requested_at?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          invite_id?: string | null
          requested_at?: string
          responded_at?: string | null
          responded_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_join_requests_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "household_join_requests_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "household_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          id: string
          invited_by: string | null
          joined_at: string
          role: Database["public"]["Enums"]["household_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["household_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          invited_by?: string | null
          joined_at?: string
          role?: Database["public"]["Enums"]["household_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_plans: {
        Row: {
          created_at: string
          expires_at: string | null
          household_id: string
          id: string
          plan: Database["public"]["Enums"]["plan_type"]
          pro_expires_at: string | null
          source: string | null
          started_at: string
          status: Database["public"]["Enums"]["plan_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          household_id: string
          id?: string
          plan?: Database["public"]["Enums"]["plan_type"]
          pro_expires_at?: string | null
          source?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["plan_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          household_id?: string
          id?: string
          plan?: Database["public"]["Enums"]["plan_type"]
          pro_expires_at?: string | null
          source?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["plan_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_plans_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string
          id: string
          is_blocked: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name: string
          id?: string
          is_blocked?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string
          id?: string
          is_blocked?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          account_id: string | null
          amount: number
          attachments: string[] | null
          category: string
          created_at: string
          description: string
          household_id: string | null
          id: string
          is_recurring: boolean
          member_id: string | null
          notes: string | null
          payment_method: string
          status: string
          transaction_date: string
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id?: string | null
          amount: number
          attachments?: string[] | null
          category?: string
          created_at?: string
          description: string
          household_id?: string | null
          id?: string
          is_recurring?: boolean
          member_id?: string | null
          notes?: string | null
          payment_method?: string
          status?: string
          transaction_date?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string | null
          amount?: number
          attachments?: string[] | null
          category?: string
          created_at?: string
          description?: string
          household_id?: string | null
          id?: string
          is_recurring?: boolean
          member_id?: string | null
          notes?: string | null
          payment_method?: string
          status?: string
          transaction_date?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "family_members"
            referencedColumns: ["id"]
          },
        ]
      }
      user_preferences: {
        Row: {
          created_at: string
          dark_mode: boolean
          id: string
          notifications_enabled: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dark_mode?: boolean
          id?: string
          notifications_enabled?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dark_mode?: boolean
          id?: string
          notifications_enabled?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_grant_pro_days: {
        Args: { _admin_id: string; _days: number; _household_id: string }
        Returns: Json
      }
      admin_set_plan: {
        Args: {
          _admin_id: string
          _expires_at: string
          _household_id: string
          _plan: Database["public"]["Enums"]["plan_type"]
        }
        Returns: Json
      }
      can_create_account: { Args: { _household_id: string }; Returns: boolean }
      can_use_ocr: { Args: { _household_id: string }; Returns: boolean }
      count_household_accounts: {
        Args: { _household_id: string }
        Returns: number
      }
      create_household_with_owner: { Args: { _name: string }; Returns: Json }
      generate_invite_code: { Args: never; Returns: string }
      get_household_plan: {
        Args: { _household_id: string }
        Returns: Database["public"]["Enums"]["plan_type"]
      }
      has_app_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_household_admin: {
        Args: { _household_id: string; _user_id: string }
        Returns: boolean
      }
      is_household_member: {
        Args: { _household_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      join_household_by_code: { Args: { _code: string }; Returns: Json }
      redeem_coupon: {
        Args: { _code: string; _household_id: string }
        Returns: Json
      }
      respond_to_join_request: {
        Args: { _approve: boolean; _request_id: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "super_admin" | "user"
      household_role: "owner" | "admin" | "member"
      plan_status: "active" | "cancelled" | "expired" | "trial"
      plan_type: "BASIC" | "PRO"
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
      app_role: ["super_admin", "user"],
      household_role: ["owner", "admin", "member"],
      plan_status: ["active", "cancelled", "expired", "trial"],
      plan_type: ["BASIC", "PRO"],
    },
  },
} as const
