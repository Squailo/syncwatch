"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { CHANNEL_NAME, SYNC_DELAY_MS } from "@/lib/constants";
import VideoPlayer from "@/components/VideoPlayer";
import type { HostAction } from "@/components/VideoPlayer";
import ParticipantList from "@/components/ParticipantList";
import type { RealtimeChannel } from "@supabase/supabase-js";

interface Participant {
  name: string;
  isHost: boolean;
}

export default function RoomPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const storedUsername = sessionStorage.getItem("syncwatch_username");
    const storedVideoUrl = sessionStorage.getItem("syncwatch_video_url");
    const storedRoomId = sessionStorage.getItem("syncwatch_room_id");
    const storedIsHost =
      sessionStorage.getItem("syncwatch_is_host") === "true";

    if (!storedUsername || !storedVideoUrl || !storedRoomId) {
      router.push("/");
      return;
    }

    setUsername(storedUsername);
    setVideoUrl(storedVideoUrl);
    setIsHost(storedIsHost);

    // Connect to Supabase Realtime
    const channel = getSupabase().channel(`${CHANNEL_NAME}:${storedRoomId}`, {
      config: { broadcast: { self: true } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const presenceState = channel.presenceState();
        const users: Participant[] = [];
        Object.values(presenceState).forEach((presences) => {
          (
            presences as unknown as Array<{ name: string; isHost: boolean }>
          ).forEach((p) => {
            users.push({ name: p.name, isHost: p.isHost });
          });
        });
        setParticipants(users);
      })
      .on(
        "broadcast",
        { event: "video-sync" },
        ({
          payload,
        }: {
          payload: { action: HostAction; time: number; sync_at: number };
        }) => {
          const { action, time, sync_at } = payload;
          const delay = Math.max(0, sync_at - Date.now());

          setSyncStatus("Sincronizando...");

          setTimeout(() => {
            const video = videoRef.current;
            if (!video) return;

            switch (action) {
              case "PLAY":
                video.currentTime = time;
                video.play().catch(console.error);
                break;
              case "PAUSE":
                video.pause();
                video.currentTime = time;
                break;
              case "SEEK":
                video.currentTime = time;
                break;
            }

            setSyncStatus(null);
          }, delay);
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: storedUsername, isHost: storedIsHost });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleHostAction = useCallback(
    (action: HostAction, currentTime: number) => {
      const syncAt = Date.now() + SYNC_DELAY_MS;

      channelRef.current?.send({
        type: "broadcast",
        event: "video-sync",
        payload: {
          action,
          time: currentTime,
          sync_at: syncAt,
        },
      });
    },
    []
  );

  // Loading state
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
        <div className="flex items-center gap-3">
          {isHost && (
            <span className="px-2 py-1 rounded-full bg-yellow-500/20 text-yellow-400 text-xs font-semibold">
              👑 Anfitrión
            </span>
          )}
          <div className="flex items-center gap-2 text-sm text-zinc-400">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span>{username}</span>
          </div>
        </div>
      </header>

      {/* Main */}
      <div className="flex-1 flex flex-col lg:flex-row">
        {/* Video area */}
        <div className="flex-1 relative flex items-center justify-center p-4 lg:p-8">
          <VideoPlayer
            ref={videoRef}
            src={videoUrl}
            isHost={isHost}
            onHostAction={handleHostAction}
          />

          {/* Sync indicator */}
          {syncStatus && (
            <div className="absolute top-8 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm font-medium animate-pulse z-50">
              ⏳ {syncStatus}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-white/10 p-6 flex flex-col gap-6 bg-black/30">
          <ParticipantList participants={participants} />

          {isHost ? (
            <div className="p-4 rounded-xl bg-yellow-500/5 border border-yellow-500/20 text-center">
              <p className="text-yellow-400 text-sm font-medium">
                👑 Sos el anfitrión
              </p>
              <p className="text-zinc-500 text-xs mt-1">
                Usá los controles del video. Todos ven lo que vos controlás.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
              <p className="text-zinc-400 text-sm">👁 Modo espectador</p>
              <p className="text-zinc-600 text-xs mt-1">
                El anfitrión controla el video para todos
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
