import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* Background gradient effect */}
      <div className="fixed inset-0 -z-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-[128px]" />
        <div className="absolute bottom-1/4 left-1/3 w-[400px] h-[400px] bg-blue-600/5 rounded-full blur-[128px]" />
      </div>

      {/* Logo */}
      <div className="text-center mb-10">
        <h1 className="text-5xl sm:text-6xl font-black text-white mb-3">
          🎬 <span className="text-purple-400">Sync</span>
          <span className="text-white">Watch</span>
        </h1>
        <p className="text-zinc-500 text-lg">
          Mira videos sincronizados con tus amigos
        </p>
      </div>

      {/* Login Card */}
      <div className="w-full max-w-sm p-8 rounded-2xl bg-white/[0.03] border border-white/10 backdrop-blur-xl shadow-2xl">
        <LoginForm />
      </div>

      {/* Footer */}
      <p className="mt-8 text-xs text-zinc-700">
        Hasta 4 personas · Sync perfecto · Sin delay
      </p>
    </main>
  );
}
