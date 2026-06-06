"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { pragmaDb } from "../../lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [isMock, setIsMock] = useState(false);

  useEffect(() => {
    // Check if user is already logged in
    async function checkUser() {
      const user = await pragmaDb.getUser();
      if (user) {
        router.push("/hoy");
      }
    }
    checkUser();
    setIsMock(pragmaDb.isMock());
  }, [router]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await pragmaDb.signInWithGoogle();
    } catch (e) {
      console.error("Login failed:", e);
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-[#0a0e1a] px-6 select-none">
      <div className="w-full max-w-sm flex flex-col items-center text-center">
        {/* Pulsing logo area */}
        <div className="flex items-center gap-2 mb-6">
          <div className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#7c6fe0] opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-[#7c6fe0]"></span>
          </div>
          <span className="text-4xl font-bold tracking-tight text-white font-sans">
            Pragma
          </span>
        </div>

        {/* Short description */}
        <p className="text-sm text-text-secondary font-sans max-w-[280px] mb-8 leading-relaxed">
          Vuelca tu día en lenguaje natural.
          <br />
          Orquesta tu agenda y métricas de esfuerzo.
        </p>

        {/* Login Button */}
        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 px-5 py-3.5 bg-[#111827] hover:bg-[#1a2236] border border-white/5 hover:border-white/12 text-text-primary text-sm font-semibold rounded-lg transition-all duration-200 cursor-pointer shadow-lg disabled:opacity-50"
        >
          {loading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#7c6fe0] border-t-transparent"></div>
          ) : (
            <svg
              className="h-4.5 w-4.5"
              aria-hidden="true"
              focusable="false"
              data-prefix="fab"
              data-icon="google"
              role="img"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 488 512"
            >
              <path
                fill="currentColor"
                d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
              ></path>
            </svg>
          )}
          <span>Continuar con Google</span>
        </button>

        {/* Mock auth status banner */}
        {isMock && (
          <div className="mt-8 px-3 py-1.5 bg-[#1a2236]/80 border border-white/5 rounded-full flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[#2dd4a0]"></span>
            <span className="font-mono text-[10px] text-text-secondary uppercase tracking-wider">
              Local Mock-Auth Activo
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
