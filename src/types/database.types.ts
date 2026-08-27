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
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      buildings: {
        Row: {
          friday_close: string | null
          friday_open: string | null
          latitude: number | null
          longitude: number | null
          monday_close: string | null
          monday_open: string | null
          name: string
          saturday_close: string | null
          saturday_open: string | null
          sunday_close: string | null
          sunday_open: string | null
          thursday_close: string | null
          thursday_open: string | null
          tuesday_close: string | null
          tuesday_open: string | null
          wednesday_close: string | null
          wednesday_open: string | null
        }
        Insert: {
          friday_close?: string | null
          friday_open?: string | null
          latitude?: number | null
          longitude?: number | null
          monday_close?: string | null
          monday_open?: string | null
          name: string
          saturday_close?: string | null
          saturday_open?: string | null
          sunday_close?: string | null
          sunday_open?: string | null
          thursday_close?: string | null
          thursday_open?: string | null
          tuesday_close?: string | null
          tuesday_open?: string | null
          wednesday_close?: string | null
          wednesday_open?: string | null
        }
        Update: {
          friday_close?: string | null
          friday_open?: string | null
          latitude?: number | null
          longitude?: number | null
          monday_close?: string | null
          monday_open?: string | null
          name?: string
          saturday_close?: string | null
          saturday_open?: string | null
          sunday_close?: string | null
          sunday_open?: string | null
          thursday_close?: string | null
          thursday_open?: string | null
          tuesday_close?: string | null
          tuesday_open?: string | null
          wednesday_close?: string | null
          wednesday_open?: string | null
        }
        Relationships: []
      }
      class_schedule: {
        Row: {
          building_name: string | null
          course_code: string
          course_title: string
          date_range: unknown
          day_of_week: string
          end_date: string
          end_time: string
          id: number
          room_number: string | null
          start_date: string
          start_time: string
        }
        Insert: {
          building_name?: string | null
          course_code: string
          course_title: string
          date_range?: unknown
          day_of_week: string
          end_date: string
          end_time: string
          id?: number
          room_number?: string | null
          start_date: string
          start_time: string
        }
        Update: {
          building_name?: string | null
          course_code?: string
          course_title?: string
          date_range?: unknown
          day_of_week?: string
          end_date?: string
          end_time?: string
          id?: number
          room_number?: string | null
          start_date?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_schedule_building_name_room_number_fkey"
            columns: ["building_name", "room_number"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["building_name", "room_number"]
          },
        ]
      }
      daily_events: {
        Row: {
          building_name: string
          created_at: string | null
          end_time: string
          event_name: string
          id: number
          occupant: string
          room_number: string
          start_time: string
        }
        Insert: {
          building_name: string
          created_at?: string | null
          end_time: string
          event_name: string
          id?: number
          occupant: string
          room_number: string
          start_time: string
        }
        Update: {
          building_name?: string
          created_at?: string | null
          end_time?: string
          event_name?: string
          id?: number
          occupant?: string
          room_number?: string
          start_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_events_building_name_room_number_fkey"
            columns: ["building_name", "room_number"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["building_name", "room_number"]
          },
        ]
      }
      room_availability_cache: {
        Row: {
          building_name: string
          busy_times: unknown
          check_date: string
          room_number: string
          schedule_data: Json | null
          updated_at: string | null
        }
        Insert: {
          building_name: string
          busy_times?: unknown
          check_date: string
          room_number: string
          schedule_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          building_name?: string
          busy_times?: unknown
          check_date?: string
          room_number?: string
          schedule_data?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      room_availability_cache_segments: {
        Row: {
          building_name: string
          check_date: string
          current_activity: Json | null
          is_occupied: boolean
          meaningful_available_at: string | null
          next_activity: Json | null
          next_island_start: string | null
          next_start_time: string | null
          room_number: string
          segment_end: string
          segment_start: string
        }
        Insert: {
          building_name: string
          check_date: string
          current_activity?: Json | null
          is_occupied: boolean
          meaningful_available_at?: string | null
          next_activity?: Json | null
          next_island_start?: string | null
          next_start_time?: string | null
          room_number: string
          segment_end: string
          segment_start: string
        }
        Update: {
          building_name?: string
          check_date?: string
          current_activity?: Json | null
          is_occupied?: boolean
          meaningful_available_at?: string | null
          next_activity?: Json | null
          next_island_start?: string | null
          next_start_time?: string | null
          room_number?: string
          segment_end?: string
          segment_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_availability_cache_segments_room_fkey"
            columns: ["building_name", "room_number", "check_date"]
            isOneToOne: false
            referencedRelation: "room_availability_cache"
            referencedColumns: ["building_name", "room_number", "check_date"]
          },
        ]
      }
      rooms: {
        Row: {
          building_name: string
          room_number: string
        }
        Insert: {
          building_name: string
          room_number: string
        }
        Update: {
          building_name?: string
          room_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_building_name_fkey"
            columns: ["building_name"]
            isOneToOne: false
            referencedRelation: "buildings"
            referencedColumns: ["name"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_cached_spots: {
        Args: {
          check_date_param: string
          check_time_param: string
          min_minutes_param?: number
        }
        Returns: Json
      }
      get_room_schedule: {
        Args: {
          building_id_param: string
          check_date: string
          room_number_param: string
        }
        Returns: Json
      }
      get_room_schedule_cached: {
        Args: {
          building_id_param: string
          check_date_param: string
          room_number_param: string
        }
        Returns: Json
      }
      get_spots: {
        Args: {
          check_date: string
          check_time: string
          minimum_useful_minutes?: number
        }
        Returns: Json
      }
      refresh_room_availability_cache: {
        Args: { target_date?: string }
        Returns: undefined
      }
      refresh_room_availability_cache_segments: {
        Args: { target_date: string }
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
  public: {
    Enums: {},
  },
} as const
