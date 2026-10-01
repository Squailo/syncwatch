"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [wantsHost, setWantsHost] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Ingresa tu nombre y la contraseña");
      return;
    }

    setLoading(true);

    try {
      const { data, error: dbError } = await getSupabase()
        .from("rooms")
        .select("*")
        .eq("password", password.trim())
        .single();

      if (dbError || !data) {
        console.error("Login Supabase error:", dbError);
        setError("Contraseña incorrecta o error de conexión con Supabase");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("syncwatch_username", username.trim());
      sessionStorage.setItem("syncwatch_video_url", data.video_url);
      if (data.subtitles_url) {
        sessionStorage.setItem("syncwatch_subtitles_url", data.subtitles_url);
      } else {
        sessionStorage.removeItem("syncwatch_subtitles_url");
      }
      sessionStorage.setItem("syncwatch_room_id", data.id);
      sessionStorage.setItem("syncwatch_wants_host", wantsHost ? "true" : "false");

      router.push("/room");
    } catch {
      setError("Error al conectar. Intenta de nuevo.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-5">
      <div>
        <label
          htmlFor="username"
          className="block text-sm font-medium text-zinc-300 mb-2"
        >
          Tu nombre
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Ej: Nico, Franco..."
          maxLength={20}
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          autoFocus
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-zinc-300 mb-2"
        >
          Contraseña de la sala
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
        />
      </div>

      {/* Host Option Checkbox */}
      <div
        onClick={() => setWantsHost(!wantsHost)}
        className={`flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer select-none transition-all ${
          wantsHost
            ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-300"
            : "bg-white/[0.02] border-white/10 text-zinc-400 hover:border-white/20"
        }`}
      >
        <div
          className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
            wantsHost
              ? "bg-yellow-500 border-yellow-500 text-black font-bold text-xs"
              : "border-zinc-600"
          }`}
        >
          {wantsHost && "✓"}
        </div>
        <div className="flex-1">
          <p className="text-xs font-semibold text-white flex items-center gap-1.5">
            <span>👑</span> Quiero ser Anfitrión
          </p>
          <p className="text-[11px] text-zinc-500">
            Controlarás el video si la sala no tiene otro anfitrión activo
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs text-center font-medium">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-base transition-all duration-200 hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-purple-600/30 flex items-center justify-center gap-2"
      >
        {loading ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Verificando...</span>
          </>
        ) : (
          <span>ENTRAR A LA SALA</span>
        )}
      </button>
    </form>
  );
}
