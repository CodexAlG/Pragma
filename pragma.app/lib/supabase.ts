import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder-project.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface TimelineItem {
  id: string;
  time: string;
  title: string;
  type: "dev" | "meeting" | "client" | "bug" | "idea";
  status: "done" | "active" | "pending";
}

export interface VaultItem {
  id: string;
  text: string;
  tag: string;
  created_at: string;
  status?: "pending" | "completed";
}

export interface DayData {
  current_day?: {
    date: string;
    raw_text: string;
    flags: string[];
    context_answers: Record<string, any>;
    timeline: TimelineItem[];
  };
  vault?: VaultItem[];
}

export interface ProfileData {
  id: string;
  email: string;
  day_data: DayData;
  updated_at?: string;
}

export interface PragmaUser {
  id: string;
  email: string;
}

export const pragmaDb = {
  isMock: () => false, // Mock layer is removed

  // Retrieve authenticated user from real Supabase Auth
  async getUser(): Promise<PragmaUser | null> {
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return null;
      return { id: user.id, email: user.email || "" };
    } catch (e) {
      console.error("Supabase getUser error:", e);
      return null;
    }
  },

  // Perform Sign-In with real Google OAuth
  async signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/hoy`,
      },
    });
    if (error) throw error;
  },

  // Perform Sign-Out
  async signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) console.error("Error signing out:", error);
    window.location.href = "/login";
  },

  // Get Profile Data from Supabase profiles table
  async getProfile(): Promise<ProfileData | null> {
    const user = await this.getUser();
    if (!user) return null;

    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      console.error("Supabase profile select error:", error);
      return null;
    }

    if (!data) {
      // Create initial profile row if it doesn't exist yet for the user
      const newProfile = {
        id: user.id,
        email: user.email,
        day_data: {
          current_day: {
            date: new Date().toISOString().split("T")[0],
            raw_text: "",
            flags: [],
            context_answers: {},
            timeline: [],
          },
          vault: [],
        },
      };
      const { data: inserted, error: insertError } = await supabase
        .from("profiles")
        .insert(newProfile)
        .select("*")
        .single();

      if (insertError) {
        console.error("Error creating Supabase profile:", insertError);
        return null;
      }
      return inserted as ProfileData;
    }
    return data as ProfileData;
  },

  // Save/Upsert Day Data in Supabase
  async updateDayData(dayData: DayData): Promise<boolean> {
    const user = await this.getUser();
    if (!user) return false;

    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        email: user.email,
        day_data: dayData,
        updated_at: new Date().toISOString(),
      });

    if (error) {
      console.error("Error upserting Supabase day data:", error);
      return false;
    }
    return true;
  },
};
