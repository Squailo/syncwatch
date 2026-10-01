"use client";

export interface Participant {
  name: string;
  isHost: boolean;
}

interface ParticipantListProps {
  participants: Participant[];
  currentUsername: string;
  isHost: boolean;
  onClaimHost?: () => void;
  onRelinquishHost?: () => void;
}

export default function ParticipantList({
  participants,
  currentUsername,
  isHost,
  onClaimHost,
  onRelinquishHost,
}: ParticipantListProps) {
  const hasHost = participants.some((p) => p.isHost);

  return (
    <div className="bg-white/[0.02] border border-white/10 rounded-2xl p-4 backdrop-blur-md">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          <span>👥</span> Conectados ({participants.length}/4)
        </h2>
        {isHost && (
          <span className="text-[11px] font-semibold text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full border border-yellow-500/30">
            Sos el Host 👑
          </span>
        )}
      </div>

      <div className="space-y-2">
        {participants.length === 0 ? (
          <div className="p-3 rounded-xl bg-white/5 border border-dashed border-white/10 text-center">
            <p className="text-xs text-zinc-500">Conectando a la sala...</p>
          </div>
        ) : (
          participants.map((p, i) => {
            const isMe = p.name === currentUsername;

            return (
              <div
                key={`${p.name}-${i}`}
                className={`flex items-center gap-3 p-2.5 rounded-xl border transition-all duration-200 ${
                  p.isHost
                    ? "bg-yellow-500/10 border-yellow-500/30 shadow-sm shadow-yellow-500/5"
                    : isMe
                    ? "bg-purple-500/5 border-purple-500/20"
                    : "bg-white/[0.03] border-white/5"
                }`}
              >
                {/* Status Dot */}
                <div className="relative">
                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      p.isHost ? "bg-yellow-400" : "bg-green-500"
                    }`}
                  />
                  <div
                    className={`absolute inset-0 w-2.5 h-2.5 rounded-full animate-ping opacity-60 ${
                      p.isHost ? "bg-yellow-400" : "bg-green-500"
                    }`}
                  />
                </div>

                {/* Name */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-white truncate flex items-center gap-1.5">
                    <span>{p.name}</span>
                    {isMe && (
                      <span className="text-[10px] text-zinc-500 font-normal">
                        (Tú)
                      </span>
                    )}
                  </p>
                </div>

                {/* Role Tag */}
                <span
                  className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md ${
                    p.isHost
                      ? "bg-yellow-400/20 text-yellow-300 border border-yellow-400/30"
                      : "text-zinc-500 bg-white/5"
                  }`}
                >
                  {p.isHost ? "👑 Anfitrión" : "Espectador"}
                </span>
              </div>
            );
          })
        )}
      </div>

      {/* Host Control Actions */}
      <div className="mt-3 pt-3 border-t border-white/5">
        {!hasHost && onClaimHost && (
          <button
            type="button"
            onClick={onClaimHost}
            className="w-full py-2 px-3 rounded-xl bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 text-yellow-300 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 shadow-sm"
          >
            <span>👑</span> Tomar control de Anfitrión
          </button>
        )}

        {isHost && onRelinquishHost && (
          <button
            type="button"
            onClick={onRelinquishHost}
            className="w-full py-1.5 px-3 rounded-lg hover:bg-white/5 text-zinc-500 hover:text-zinc-300 text-[11px] transition-all text-center"
          >
            Ceder rol de anfitrión
          </button>
        )}
      </div>
    </div>
  );
}
