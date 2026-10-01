"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";

export default function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isHost, setIsHost] = useState(false);
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
        .select("id, video_url")
        .eq("password", password.trim())
        .single();

      if (dbError || !data) {
        setError("Contraseña incorrecta");
        setLoading(false);
        return;
      }

      sessionStorage.setItem("syncwatch_username", username.trim());
      sessionStorage.setItem("syncwatch_video_url", data.video_url);
      sessionStorage.setItem("syncwatch_room_id", data.id);
      sessionStorage.setItem("syncwatch_is_host", isHost ? "true" : "false");

      router.push("/room");
    } catch {
      setError("Error al conectar. Intenta de nuevo.");
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-6">
      <div>
        <label
          htmlFor="username"
          className="block text-sm font-medium text-zinc-400 mb-2"
        >
          Tu nombre
        </label>
        <input
          id="username"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="¿Cómo te llamas?"
          className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
          autoFocus
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-sm font-medium text-zinc-400 mb-2"
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

      {/* Host toggle */}
      <button
        type="button"
        onClick={() => setIsHost(!isHost)}
        className={`w-full flex items-center gap-3 p-4 rounded-xl border transition-all duration-300 ${
          isHost
            ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
            : "bg-white/5 border-white/10 text-zinc-500 hover:border-white/20"
        }`}
      >
        <span className="text-xl">{isHost ? "👑" : "👁"}</span>
        <div className="text-left flex-1">
          <p className="text-sm font-medium">
            {isHost ? "Soy el anfitrión" : "Soy espectador"}
          </p>
          <p className="text-xs opacity-60">
            {isHost
              ? "Yo controlo el video para todos"
              : "Alguien más controla el video"}
          </p>
        </div>
        <div
          className={`w-10 h-6 rounded-full relative transition-colors duration-300 ${
            isHost ? "bg-yellow-500" : "bg-zinc-700"
          }`}
        >
          <div
            className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform duration-300 ${
              isHost ? "translate-x-5" : "translate-x-1"
            }`}
          />
        </div>
      </button>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-lg transition-all duration-300 hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-2">
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
            Conectando...
          </span>
        ) : (
          "CONECTAR"
        )}
      </button>
    </form>
  );
}
