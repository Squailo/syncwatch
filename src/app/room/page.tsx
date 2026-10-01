"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { CHANNEL_NAME } from "@/lib/constants";
import VideoPlayer, { SyncPayload } from "@/components/VideoPlayer";
import ParticipantList, { Participant } from "@/components/ParticipantList";
import LiveChat, { ChatMessage } from "@/components/LiveChat";
import type { RealtimeChannel } from "@supabase/supabase-js";

const formatTimeShort = (seconds: number) => {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
};

export default function RoomPage() {
  const router = useRouter();
  const [username, setUsername] = useState<string>("");
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [subtitlesUrl, setSubtitlesUrl] = useState<string>("");
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [activeTab, setActiveTab] = useState<"chat" | "participants">("chat");

  const channelRef = useRef<RealtimeChannel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Keep a ref to latest isHost to avoid stale closures in callbacks
  const isHostRef = useRef(isHost);
  useEffect(() => {
    isHostRef.current = isHost;
  }, [isHost]);

  const usernameRef = useRef(username);
  useEffect(() => {
    usernameRef.current = username;
  }, [username]);

  // Handle participant sync & single-host enforcement
  const handlePresenceUpdate = useCallback((channel: RealtimeChannel) => {
    const presenceState = channel.presenceState();
    const users: Participant[] = [];
    const myName = usernameRef.current;

    Object.values(presenceState).forEach((presences) => {
      (
        presences as unknown as Array<{ name: string; isHost: boolean }>
      ).forEach((p) => {
        if (p?.name) {
          users.push({ name: p.name, isHost: Boolean(p.isHost) });
        }
      });
    });

    setParticipants(users);

    // Single host enforcement:
    // Check if there is currently any host in the room
    const currentHost = users.find((u) => u.isHost);

    if (currentHost) {
      // If someone else is host, ensure I am not host
      if (currentHost.name !== myName && isHostRef.current) {
        setIsHost(false);
        channel.track({ name: myName, isHost: false });
      } else if (currentHost.name === myName && !isHostRef.current) {
        setIsHost(true);
      }
    } else {
      // No host in room at all. If I wanted host or I am the only one, become host!
      const wantsHost = sessionStorage.getItem("syncwatch_wants_host") === "true";
      if (wantsHost || users.length === 1) {
        setIsHost(true);
        channel.track({ name: myName, isHost: true });
      }
    }
  }, []);

  useEffect(() => {
    const storedUsername = sessionStorage.getItem("syncwatch_username");
    const storedVideoUrl = sessionStorage.getItem("syncwatch_video_url");
    const storedRoomId = sessionStorage.getItem("syncwatch_room_id");
    const wantsHost = sessionStorage.getItem("syncwatch_wants_host") === "true";

    if (!storedUsername || !storedVideoUrl || !storedRoomId) {
      router.push("/");
      return;
    }

function normalizeMediaUrl(url: string): string {
  if (!url) return "";
  return url.trim().replace(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i, "pixeldrain.com/api/file/$1");
}

    setUsername(storedUsername);
    setVideoUrl(normalizeMediaUrl(storedVideoUrl));

    const storedSubtitlesUrl = sessionStorage.getItem("syncwatch_subtitles_url") || "";
    setSubtitlesUrl(normalizeMediaUrl(storedSubtitlesUrl));

    // Refresh room subtitles and video from DB if changed
    getSupabase()
      .from("rooms")
      .select("video_url, subtitles_url")
      .eq("id", storedRoomId)
      .single()
      .then(
        ({ data }) => {
          if (data?.video_url) {
            const normVideo = normalizeMediaUrl(data.video_url);
            setVideoUrl(normVideo);
            sessionStorage.setItem("syncwatch_video_url", normVideo);
          }
          if (data?.subtitles_url) {
            const normSub = normalizeMediaUrl(data.subtitles_url);
            setSubtitlesUrl(normSub);
            sessionStorage.setItem("syncwatch_subtitles_url", normSub);
          }
        },
        () => {}
      );

    // Initial default message
    setMessages([
      {
        id: "welcome",
        sender: "Sistema",
        text: `¡Bienvenido ${storedUsername}! Conectado a la sala.`,
        isHost: false,
        isSystem: true,
        timestamp: Date.now(),
      },
    ]);

    // Connect to Supabase Realtime channel
    const channel = getSupabase().channel(`${CHANNEL_NAME}:${storedRoomId}`, {
      config: { broadcast: { self: false } },
    });

    channel
      // Presence Sync
      .on("presence", { event: "sync" }, () => {
        handlePresenceUpdate(channel);
      })
      .on("presence", { event: "join" }, ({ newPresences }) => {
        handlePresenceUpdate(channel);

        // If I am host, send current video state to the newcomer so they are in sync instantly
        if (isHostRef.current && videoRef.current) {
          const video = videoRef.current;
          channel.send({
            type: "broadcast",
            event: "video-sync",
            payload: {
              action: "SEEK",
              currentTime: video.currentTime,
              isPlaying: !video.paused,
              sentAt: Date.now(),
              sender: usernameRef.current,
            },
          });
        }
      })
      .on("presence", { event: "leave" }, () => {
        handlePresenceUpdate(channel);
      })

      // Immediate Video Sync (0-50ms)
      .on("broadcast", { event: "video-sync" }, ({ payload }: { payload: SyncPayload & { sender?: string } }) => {
        const video = videoRef.current;
        if (!video) return;

        // If by any chance I am the host who sent this, ignore
        if (isHostRef.current) return;

        const { currentTime, isPlaying, sentAt, action, sender } = payload;

        // Calculate network transmission time (typically 20-50ms)
        const networkLag = Math.max(0, (Date.now() - sentAt) / 1000);
        const targetTime = isPlaying ? currentTime + networkLag : currentTime;

        // Sync playback position
        const timeDiff = Math.abs(video.currentTime - targetTime);

        // Only seek if difference is noticeable (> 150ms) to avoid micro-stuttering
        if (timeDiff > 0.15 || action === "SEEK" || action === "RESTART") {
          video.currentTime = targetTime;
        }

        // Sync playback state
        if (isPlaying && video.paused) {
          video.play().catch(console.error);
        } else if (!isPlaying && !video.paused) {
          video.pause();
        }

        // Add system message on seek/restart if needed
        if (action === "RESTART") {
          setMessages((prev) => [
            ...prev,
            {
              id: `sys-${Date.now()}`,
              sender: "Sistema",
              text: `👑 ${sender || "El anfitrión"} reinició el video.`,
              isHost: false,
              isSystem: true,
              timestamp: Date.now(),
            },
          ]);
        }
      })

      // Live Chat Broadcast
      .on("broadcast", { event: "chat-message" }, ({ payload }: { payload: ChatMessage }) => {
        setMessages((prev) => [...prev, payload]);
      })

      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ name: storedUsername, isHost: wantsHost });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [handlePresenceUpdate, router]);

  // Host Action Handler: Broadcasts immediately (< 50ms)
  const handleHostSync = useCallback((payload: SyncPayload) => {
    if (!isHostRef.current) return;

    channelRef.current?.send({
      type: "broadcast",
      event: "video-sync",
      payload: {
        ...payload,
        sender: usernameRef.current,
      },
    });

    // Optionally notify chat of major actions
    if (payload.action === "SEEK") {
      const timeStr = formatTimeShort(payload.currentTime);
      const systemMsg: ChatMessage = {
        id: `seek-${Date.now()}`,
        sender: "Sistema",
        text: `👑 ${usernameRef.current} saltó a ${timeStr}`,
        isHost: false,
        isSystem: true,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, systemMsg]);
      channelRef.current?.send({
        type: "broadcast",
        event: "chat-message",
        payload: systemMsg,
      });
    }
  }, []);

  // Claim Host role if available
  const handleClaimHost = useCallback(async () => {
    const hasAnyHost = participants.some((p) => p.isHost && p.name !== username);
    if (hasAnyHost) return;

    setIsHost(true);
    await channelRef.current?.track({ name: username, isHost: true });

    const msg: ChatMessage = {
      id: `claim-${Date.now()}`,
      sender: "Sistema",
      text: `👑 ${username} ahora es el anfitrión de la sala.`,
      isHost: false,
      isSystem: true,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    channelRef.current?.send({
      type: "broadcast",
      event: "chat-message",
      payload: msg,
    });
  }, [participants, username]);

  // Relinquish Host role
  const handleRelinquishHost = useCallback(async () => {
    setIsHost(false);
    await channelRef.current?.track({ name: username, isHost: false });

    const msg: ChatMessage = {
      id: `relinquish-${Date.now()}`,
      sender: "Sistema",
      text: `${username} dejó de ser anfitrión. El rol está disponible.`,
      isHost: false,
      isSystem: true,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    channelRef.current?.send({
      type: "broadcast",
      event: "chat-message",
      payload: msg,
    });
  }, [username]);

  // Send Chat Message
  const handleSendMessage = useCallback(
    (text: string) => {
      const newMsg: ChatMessage = {
        id: `${username}-${Date.now()}`,
        sender: username,
        text,
        isHost,
        timestamp: Date.now(),
      };

      // Add locally immediately
      setMessages((prev) => [...prev, newMsg]);

      // Broadcast to others
      channelRef.current?.send({
        type: "broadcast",
        event: "chat-message",
        payload: newMsg,
      });
    },
    [username, isHost]
  );

  const handleLeaveRoom = () => {
    sessionStorage.clear();
    router.push("/");
  };

  if (!username) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin h-8 w-8 border-2 border-purple-500 border-t-transparent rounded-full" />
          <p className="text-zinc-500 text-xs">Cargando sala...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col selection:bg-purple-500 selection:text-white">
      {/* Top Header */}
      <header className="h-16 px-4 lg:px-6 border-b border-white/10 bg-black/60 backdrop-blur-xl flex items-center justify-between shrink-0 z-40">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-black tracking-tight flex items-center gap-1.5">
            <span>🎬</span>
            <span className="text-purple-400">Sync</span>
            <span>Watch</span>
          </h1>
          <span className="hidden sm:inline-block w-1.5 h-1.5 rounded-full bg-zinc-700" />
          <span className="hidden sm:inline-block text-xs text-zinc-400 font-mono">
            {participants.length}/4 en la sala
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Role badge */}
          {isHost ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs font-semibold shadow-sm shadow-yellow-500/10">
              <span>👑</span>
              <span>Anfitrión</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-zinc-400 text-xs font-medium">
              <span>👁</span>
              <span>Espectador</span>
            </div>
          )}

          {/* User badge */}
          <div className="flex items-center gap-2 pl-2 border-l border-white/10 text-xs text-zinc-300">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            <span className="font-medium truncate max-w-[120px]">{username}</span>
          </div>

          {/* Exit Button */}
          <button
            type="button"
            onClick={handleLeaveRoom}
            className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-white/5 rounded-lg transition-colors text-xs"
            title="Salir de la sala"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video Column */}
        <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 lg:p-8 bg-[#070707] overflow-y-auto">
          <div className="w-full max-w-5xl flex flex-col items-center gap-4">
            <VideoPlayer
              ref={videoRef}
              src={videoUrl}
              subtitlesUrl={subtitlesUrl}
              isHost={isHost}
              onHostSync={handleHostSync}
            />

            {/* Subtitle / Helper Info Bar */}
            <div className="w-full flex items-center justify-between text-xs text-zinc-500 px-2">
              <div className="flex items-center gap-2">
                {isHost ? (
                  <p className="flex items-center gap-1.5 text-yellow-300/80">
                    <span>👑</span>
                    <span>Tus acciones se transmiten en tiempo real sin delay.</span>
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-zinc-400">
                    <span>👁</span>
                    <span>Reproducción sincronizada con el anfitrión.</span>
                  </p>
                )}
              </div>
              <p className="hidden sm:block text-zinc-600">
                Atajos: Espacio (Play/Pausa) · J/L (±10s) · M (Mute) · F (Fullscreen)
              </p>
            </div>
          </div>
        </main>

        {/* Sidebar: Chat & Participants */}
        <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col bg-[#0b0b0e] h-[450px] lg:h-auto shrink-0">
          {/* Tab Selector */}
          <div className="p-2 border-b border-white/10 flex items-center gap-1 bg-black/40">
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "chat"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span>💬</span>
              <span>Chat en Vivo</span>
              {messages.length > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                  {messages.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("participants")}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${
                activeTab === "participants"
                  ? "bg-purple-600 text-white shadow-md shadow-purple-600/20"
                  : "text-zinc-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <span>👥</span>
              <span>Conectados</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {participants.length}
              </span>
            </button>
          </div>

          {/* Tab Contents */}
          <div className="flex-1 p-3 overflow-hidden flex flex-col">
            {activeTab === "chat" ? (
              <LiveChat
                messages={messages}
                onSendMessage={handleSendMessage}
                currentUsername={username}
                isHost={isHost}
              />
            ) : (
              <ParticipantList
                participants={participants}
                currentUsername={username}
                isHost={isHost}
                onClaimHost={handleClaimHost}
                onRelinquishHost={handleRelinquishHost}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
