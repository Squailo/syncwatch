"use client";

export interface Participant {
  name: string;
  ready: boolean;
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
                p.ready
                  ? "bg-green-500/5 border-green-500/20"
                  : "bg-white/5 border-white/10"
              }`}
            >
              <div className="relative">
                <div
                  className={`w-3 h-3 rounded-full transition-colors duration-300 ${
                    p.ready ? "bg-green-500" : "bg-zinc-600"
                  }`}
                />
                {p.ready && (
                  <div className="absolute inset-0 w-3 h-3 rounded-full bg-green-500 animate-ping opacity-75" />
                )}
              </div>
              <span className="text-sm text-white font-medium flex-1 truncate">
                {p.name}
              </span>
              <span
                className={`text-xs font-semibold uppercase tracking-wide transition-colors duration-300 ${
                  p.ready ? "text-green-400" : "text-zinc-600"
                }`}
              >
                {p.ready ? "✓ Listo" : "Esperando"}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
