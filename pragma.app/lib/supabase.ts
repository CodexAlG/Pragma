import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check if we are in mock mode (variables are missing or equal to placeholders)
const isMockMode =
  !supabaseUrl ||
  !supabaseAnonKey ||
  supabaseUrl.includes("your-supabase-url") ||
  supabaseAnonKey.includes("your-supabase-anon-key") ||
  (typeof window !== "undefined" && window.localStorage.getItem("PRAGMA_FORCE_MOCK") === "true");

// Standard Supabase client (only initialized when keys are valid to avoid crash)
export const supabase = !isMockMode
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null;

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
  isMock: () => isMockMode,

  // Retrieve authenticated user
  async getUser(): Promise<PragmaUser | null> {
    if (isMockMode) {
      if (typeof window === "undefined") return null;
      const session = window.localStorage.getItem("pragma_mock_session");
      if (!session) return null;
      try {
        return JSON.parse(session);
      } catch {
        return null;
      }
    } else {
      if (!supabase) return null;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;
        return { id: user.id, email: user.email || "" };
      } catch (e) {
        console.error("Supabase getUser error, falling back to mock:", e);
        return null;
      }
    }
  },

  // Perform Sign-In
  async signInWithGoogle(forceMock: boolean = false) {
    if (isMockMode || forceMock) {
      if (typeof window === "undefined") return;
      const mockUser = {
        id: "11111111-1111-1111-1111-111111111111",
        email: "developer@pragma.app",
      };
      window.localStorage.setItem("pragma_mock_session", JSON.stringify(mockUser));
      if (forceMock) {
        window.localStorage.setItem("PRAGMA_FORCE_MOCK", "true");
      }
      window.location.href = "/hoy";
    } else {
      if (!supabase) return;
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/api/auth/callback`,
        },
      });
    }
  },

  // Perform Sign-Out
  async signOut() {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem("pragma_mock_session");
      window.localStorage.removeItem("PRAGMA_FORCE_MOCK");
    }
    if (!isMockMode && supabase) {
      await supabase.auth.signOut().catch(console.error);
    }
    window.location.href = "/login";
  },

  // Get Profile Data
  async getProfile(): Promise<ProfileData | null> {
    const user = await this.getUser();
    if (!user) return null;

    if (isMockMode) {
      if (typeof window === "undefined") return null;
      const profilesStr = window.localStorage.getItem("pragma_mock_profiles") || "{}";
      const profiles = JSON.parse(profilesStr);
      if (!profiles[user.id]) {
        // Initial mock state template
        const initialProfile: ProfileData = {
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
        profiles[user.id] = initialProfile;
        window.localStorage.setItem("pragma_mock_profiles", JSON.stringify(profiles));
      }
      return profiles[user.id];
    } else {
      if (!supabase) return null;
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
    }
  },

  // Save Day Data
  async updateDayData(dayData: DayData): Promise<boolean> {
    const user = await this.getUser();
    if (!user) return false;

    if (isMockMode) {
      if (typeof window === "undefined") return false;
      const profilesStr = window.localStorage.getItem("pragma_mock_profiles") || "{}";
      const profiles = JSON.parse(profilesStr);
      if (profiles[user.id]) {
        profiles[user.id].day_data = dayData;
      } else {
        profiles[user.id] = {
          id: user.id,
          email: user.email,
          day_data: dayData,
        };
      }
      window.localStorage.setItem("pragma_mock_profiles", JSON.stringify(profiles));
      return true;
    } else {
      if (!supabase) return false;
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
    }
  },
};
