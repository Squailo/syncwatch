"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { CHANNEL_NAME } from "@/lib/constants";
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
  const [hostTaken, setHostTaken] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const storedUsername = sessionStorage.getItem("syncwatch_username");
    const storedVideoUrl = sessionStorage.getItem("syncwatch_video_url");
    const storedRoomId = sessionStorage.getItem("syncwatch_room_id");
    let wantsHost = sessionStorage.getItem("syncwatch_is_host") === "true";

    if (!storedUsername || !storedVideoUrl || !storedRoomId) {
      router.push("/");
      return;
    }

    setUsername(storedUsername);
    setVideoUrl(storedVideoUrl);

    // IMPORTANT: self: false — host does NOT receive own broadcasts
    // Host controls their video directly, broadcasts only go to spectators
    const channel = getSupabase().channel(`${CHANNEL_NAME}:${storedRoomId}`, {
      config: { broadcast: { self: false } },
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

        // Check if someone else is already host
        const otherHosts = users.filter(
          (u) => u.isHost && u.name !== storedUsername
        );
        if (otherHosts.length > 0 && wantsHost) {
          // Another host exists — force this user to spectator
          wantsHost = false;
          setIsHost(false);
          setHostTaken(true);
          sessionStorage.setItem("syncwatch_is_host", "false");
          channel.track({ name: storedUsername, isHost: false });
        }
      })
      .on(
        "broadcast",
        { event: "video-sync" },
        ({
          payload,
        }: {
          payload: { action: HostAction; time: number };
        }) => {
          // Spectators receive this and mirror the host's video
          const video = videoRef.current;
          if (!video) return;

          switch (payload.action) {
            case "PLAY":
              video.currentTime = payload.time;
              video.play().catch(console.error);
              break;
            case "PAUSE":
              video.pause();
              video.currentTime = payload.time;
              break;
            case "SEEK":
              video.currentTime = payload.time;
              break;
          }
        }
      )
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setIsHost(wantsHost);
          await channel.track({
            name: storedUsername,
            isHost: wantsHost,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Host action handler — broadcasts immediately to spectators (0 delay)
  const handleHostAction = useCallback(
    (action: HostAction, currentTime: number) => {
      channelRef.current?.send({
        type: "broadcast",
        event: "video-sync",
        payload: { action, time: currentTime },
      });
    },
    []
  );

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

      {/* Host taken alert */}
      {hostTaken && (
        <div className="mx-6 mt-4 p-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 text-yellow-400 text-sm text-center">
          ⚠️ Ya hay un anfitrión en la sala. Entraste como espectador.
        </div>
      )}

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
                Controlá el video libremente. Todo lo que hagas se refleja en
                los espectadores al instante.
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
              <p className="text-zinc-400 text-sm">👁 Modo espectador</p>
              <p className="text-zinc-600 text-xs mt-1">
                El anfitrión controla el video
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
