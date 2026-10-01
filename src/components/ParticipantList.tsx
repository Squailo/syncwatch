"use client";

export interface Participant {
  name: string;
  isHost: boolean;
}

interface ParticipantListProps {
  participants: Participant[];
}

export default function ParticipantList({
  participants,
}: ParticipantListProps) {
  return (
    <div>
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider mb-3">
        Conectados ({participants.length}/4)
      </h2>
      <div className="space-y-2">
        {participants.length === 0 ? (
          <div className="p-4 rounded-xl bg-white/5 border border-dashed border-white/10 text-center">
            <p className="text-sm text-zinc-600">Esperando conexiones...</p>
          </div>
        ) : (
          participants.map((p, i) => (
            <div
              key={`${p.name}-${i}`}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-300 ${
                p.isHost
                  ? "bg-yellow-500/5 border-yellow-500/20"
                  : "bg-white/5 border-white/10"
              }`}
            >
              <div className="relative">
                <div
                  className={`w-3 h-3 rounded-full ${
                    p.isHost ? "bg-yellow-500" : "bg-green-500"
                  }`}
                />
                <div
                  className={`absolute inset-0 w-3 h-3 rounded-full animate-ping opacity-75 ${
                    p.isHost ? "bg-yellow-500" : "bg-green-500"
                  }`}
                />
              </div>
              <span className="text-sm text-white font-medium flex-1 truncate">
                {p.name}
              </span>
              <span
                className={`text-xs font-semibold uppercase tracking-wide ${
                  p.isHost ? "text-yellow-400" : "text-zinc-500"
                }`}
              >
                {p.isHost ? "👑 Anfitrión" : "Espectador"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
