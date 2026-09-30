"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { COUNTDOWN_SECONDS, CHANNEL_NAME } from "@/lib/constants";
import VideoPlayer from "@/components/VideoPlayer";
import Countdown from "@/components/Countdown";
import ParticipantList from "@/components/ParticipantList";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Participant {
  name: string;
  ready: boolean;
}

type RoomState = "waiting" | "countdown" | "playing";

export default function RoomPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [roomState, setRoomState] = useState<RoomState>("waiting");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [playAt, setPlayAt] = useState<number | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Use a ref to track room state inside callbacks (avoids stale closure)
  const roomStateRef = useRef<RoomState>("waiting");
  useEffect(() => {
    roomStateRef.current = roomState;
  }, [roomState]);

  // Also track if we already sent a broadcast to avoid duplicates
  const hasBroadcasted = useRef(false);

  useEffect(() => {
    // Check session
    const storedUsername = sessionStorage.getItem("syncwatch_username");
    const storedVideoUrl = sessionStorage.getItem("syncwatch_video_url");
    const storedRoomId = sessionStorage.getItem("syncwatch_room_id");

    if (!storedUsername || !storedVideoUrl || !storedRoomId) {
      router.push("/");
      return;
    }

    setUsername(storedUsername);
    setVideoUrl(storedVideoUrl);

    // Connect to Supabase Realtime channel
    const channel = getSupabase().channel(`${CHANNEL_NAME}:${storedRoomId}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const users: Participant[] = [];

        Object.values(presenceState).forEach((presences) => {
          (presences as unknown as Array<{ name: string; ready: boolean }>).forEach(
            (p) => {
              users.push({ name: p.name, ready: p.ready });
            }
          );
        });

        setParticipants(users);
      })
      .on(
        "broadcast",
        { event: "start-video" },
        ({ payload }: { payload: { play_at: number } }) => {
          // Only accept the FIRST play_at — ignore subsequent broadcasts
          if (roomStateRef.current === "waiting") {
            setPlayAt(payload.play_at);
            setRoomState("countdown");
          }
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: storedUsername, ready: false });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Detect when ALL participants are ready → trigger countdown
  useEffect(() => {
    if (roomState !== "waiting") return;
    if (participants.length === 0) return;
    if (hasBroadcasted.current) return;

    const allReady = participants.every((p) => p.ready);

    if (allReady) {
      hasBroadcasted.current = true;
      const playAtTime = Date.now() + COUNTDOWN_SECONDS * 1000;

      channelRef.current?.send({
        type: "broadcast",
        event: "start-video",
        payload: { play_at: playAtTime },
      });
    }
  }, [participants, roomState]);

  const handleReady = async () => {
    if (isReady) return;
    setIsReady(true);
    await channelRef.current?.track({ name: username, ready: true });
  };

  const handleCountdownEnd = useCallback(() => {
    setRoomState("playing");
    if (videoRef.current) {
      videoRef.current.currentTime = 0;
      videoRef.current.play().catch((err) => {
        console.error("Error al reproducir:", err);
      });
    }
  }, []);

  // Don't render until session is loaded
  if (!username) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-black/50 backdrop-blur-sm">
        <h1 className="text-xl font-bold text-white">
          🎬 <span className="text-purple-400">Sync</span>Watch
        </h1>
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span>{username}</span>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Video area */}
        <div className="flex-1 relative flex items-center justify-center p-4 lg:p-8">
          <VideoPlayer
            ref={videoRef}
            src={videoUrl}
            isPlaying={roomState === "playing"}
          />

          {/* Countdown overlay */}
          {roomState === "countdown" && playAt && (
            <div className="absolute inset-4 lg:inset-8">
              <Countdown playAt={playAt} onComplete={handleCountdownEnd} />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col gap-6 bg-black/30">
          {/* Participant list */}
          <ParticipantList participants={participants} />

          {/* Ready button */}
          {roomState === "waiting" && (
            <div className="space-y-3">
              <button
                onClick={handleReady}
                disabled={isReady}
                className={`w-full py-4 rounded-xl text-lg font-bold transition-all duration-300 ${
                  isReady
                    ? "bg-green-500/20 text-green-400 border-2 border-green-500/50 cursor-default"
                    : "bg-purple-600 hover:bg-purple-500 text-white hover:scale-[1.02] active:scale-95 shadow-lg shadow-purple-500/25"
                }`}
              >
                {isReady ? "✓ LISTO" : "🎬 LISTO, VER"}
              </button>

              {isReady && (
                <p className="text-center text-sm text-zinc-500 animate-pulse">
                  Esperando a que todos estén listos...
                </p>
              )}
            </div>
          )}

          {/* Playing indicator */}
          {roomState === "playing" && (
            <div className="flex items-center justify-center gap-2 py-4 rounded-xl bg-green-500/10 border border-green-500/20">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-400 font-semibold">
                Reproduciendo
              </span>
            </div>
          )}

          {/* Countdown indicator */}
          {roomState === "countdown" && (
            <div className="flex items-center justify-center gap-2 py-4 rounded-xl bg-purple-500/10 border border-purple-500/20 animate-pulse">
              <span className="text-purple-400 font-semibold">
                ¡Preparando sync!
              </span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
