import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  
  if (code) {
    const cookieStore = await cookies();
    const supabaseClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore errors if called from Server Component settings
            }
          },
        },
      }
    );
    try {
      await supabaseClient.auth.exchangeCodeForSession(code);
      return NextResponse.redirect(`${origin}/hoy`);
    } catch (error) {
      console.error("Code exchange failed:", error);
    }
  }

  // If there's no code or code exchange fails, redirect to /login
  return NextResponse.redirect(`${origin}/login`);
}
