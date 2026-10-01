"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { CHANNEL_NAME } from "@/lib/constants";
import VideoPlayer, { SyncPayload } from "@/components/VideoPlayer";
import YouTubePlayer from "@/components/YouTubePlayer";
import ParticipantList, { Participant } from "@/components/ParticipantList";
import LiveChat, { ChatMessage } from "@/components/LiveChat";
import type { RealtimeChannel } from "@supabase/supabase-js";

function getYouTubeId(url: string): string | null {
  if (!url) return null;
  const match = url.trim().match(
    /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|watch\?v=|watch\?.+&v=))([\w-]{11})/
  );
  return match ? match[1] : null;
}

function normalizeMediaUrl(url: string): string {
  if (!url) return "";
  return url.trim().replace(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i, "pixeldrain.com/api/file/$1");
}

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

  // Host Change Video state
  const [newVideoInput, setNewVideoInput] = useState("");
  const [showChangeVideoModal, setShowChangeVideoModal] = useState(false);

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

  const videoUrlRef = useRef(videoUrl);
  useEffect(() => {
    videoUrlRef.current = videoUrl;
  }, [videoUrl]);

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

    const currentHost = users.find((u) => u.isHost);

    if (currentHost) {
      if (currentHost.name !== myName && isHostRef.current) {
        setIsHost(false);
        channel.track({ name: myName, isHost: false });
      } else if (currentHost.name === myName && !isHostRef.current) {
        setIsHost(true);
      }
    } else {
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

    setUsername(storedUsername);
    setVideoUrl(normalizeMediaUrl(storedVideoUrl));

    const storedSubtitlesUrl = sessionStorage.getItem("syncwatch_subtitles_url") || "";
    setSubtitlesUrl(normalizeMediaUrl(storedSubtitlesUrl));

    // Refresh room video and subtitles from DB
    getSupabase()
      .from("rooms")
      .select("*")
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
      .on("presence", { event: "sync" }, () => {
        handlePresenceUpdate(channel);
      })
      .on("presence", { event: "join" }, () => {
        handlePresenceUpdate(channel);

        // If I am host, send current video state to newcomer
        if (isHostRef.current) {
          const ytId = getYouTubeId(videoUrlRef.current);
          if (!ytId && videoRef.current) {
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
        }
      })
      .on("presence", { event: "leave" }, () => {
        handlePresenceUpdate(channel);
      })

      // Immediate Video Sync
      .on("broadcast", { event: "video-sync" }, ({ payload }: { payload: SyncPayload & { sender?: string } }) => {
        if (isHostRef.current) return;

        const ytId = getYouTubeId(videoUrlRef.current);

        // If current video is YouTube, forward to YouTubePlayer via window event
        if (ytId) {
          window.dispatchEvent(new CustomEvent("syncwatch:remote-yt-sync", { detail: payload }));
          return;
        }

        // Native HTML5 video player
        const video = videoRef.current;
        if (!video) return;

        const { currentTime, isPlaying, sentAt, action, sender } = payload;
        const networkLag = Math.max(0, (Date.now() - sentAt) / 1000);
        const targetTime = isPlaying ? currentTime + networkLag : currentTime;

        const timeDiff = Math.abs(video.currentTime - targetTime);

        if (timeDiff > 0.15 || action === "SEEK" || action === "RESTART") {
          video.currentTime = targetTime;
        }

        if (isPlaying && video.paused) {
          video.play().catch(console.error);
        } else if (!isPlaying && !video.paused) {
          video.pause();
        }

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

      // Video Change Broadcast
      .on("broadcast", { event: "change-video" }, ({ payload }: { payload: { videoUrl: string; sender: string } }) => {
        const norm = normalizeMediaUrl(payload.videoUrl);
        setVideoUrl(norm);
        sessionStorage.setItem("syncwatch_video_url", norm);

        setMessages((prev) => [
          ...prev,
          {
            id: `change-${Date.now()}`,
            sender: "Sistema",
            text: `🎬 ${payload.sender} cambió el video de la sala.`,
            isHost: false,
            isSystem: true,
            timestamp: Date.now(),
          },
        ]);
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

  // Host Action Handler
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

  // Host Change Video Function
  const handleChangeVideoSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVideoInput.trim()) return;

    const newUrl = normalizeMediaUrl(newVideoInput.trim());
    setVideoUrl(newUrl);
    sessionStorage.setItem("syncwatch_video_url", newUrl);
    setNewVideoInput("");
    setShowChangeVideoModal(false);

    // Save to DB
    const storedRoomId = sessionStorage.getItem("syncwatch_room_id");
    if (storedRoomId) {
      try {
        await getSupabase().from("rooms").update({ video_url: newUrl }).eq("id", storedRoomId);
      } catch {
        // ignore
      }
    }

    // Broadcast to room
    channelRef.current?.send({
      type: "broadcast",
      event: "change-video",
      payload: {
        videoUrl: newUrl,
        sender: username,
      },
    });

    // Auto-play new video for everyone once loaded
    setTimeout(() => {
      channelRef.current?.send({
        type: "broadcast",
        event: "video-sync",
        payload: {
          action: "PLAY",
          currentTime: 0,
          isPlaying: true,
          sentAt: Date.now(),
          sender: username,
        },
      });
    }, 700);

    // System announcement
    const changeNotice: ChatMessage = {
      id: `change-${Date.now()}`,
      sender: "Sistema",
      text: `👑 ${username} cambió el video a: ${newUrl}`,
      isHost: false,
      isSystem: true,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, changeNotice]);
  };

  // Claim Host role
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

      setMessages((prev) => [...prev, newMsg]);

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

  const youtubeVideoId = getYouTubeId(videoUrl);

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

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Host Change Video Button */}
          {isHost && (
            <button
              type="button"
              onClick={() => setShowChangeVideoModal(!showChangeVideoModal)}
              className="px-3 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-200 text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm"
              title="Cambiar video (YouTube o MP4)"
            >
              <span>🔗</span>
              <span className="hidden sm:inline">Cambiar Video</span>
            </button>
          )}

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
            <span className="font-medium truncate max-w-[100px] sm:max-w-[120px]">{username}</span>
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

      {/* Host Change Video Floating Modal/Bar */}
      {showChangeVideoModal && isHost && (
        <div className="bg-purple-950/40 border-b border-purple-500/30 px-4 py-3 backdrop-blur-xl animate-in slide-in-from-top duration-200 z-30">
          <form
            onSubmit={handleChangeVideoSubmit}
            className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center gap-2"
          >
            <div className="flex-1 w-full">
              <input
                type="text"
                value={newVideoInput}
                onChange={(e) => setNewVideoInput(e.target.value)}
                placeholder="Pega un link de YouTube (ej: https://youtu.be/...) o video MP4..."
                className="w-full px-3.5 py-2 bg-black/60 border border-white/20 rounded-xl text-xs sm:text-sm text-white placeholder-zinc-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
                autoFocus
              />
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                type="submit"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md shrink-0"
              >
                Cargar para Todos 🚀
              </button>
              <button
                type="button"
                onClick={() => setShowChangeVideoModal(false)}
                className="px-3 py-2 bg-white/10 hover:bg-white/20 text-zinc-300 rounded-xl text-xs sm:text-sm transition-all"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Layout Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Video Column */}
        <main className="flex-1 flex flex-col items-center justify-center p-3 sm:p-6 lg:p-8 bg-[#070707] overflow-y-auto">
          <div className="w-full max-w-5xl flex flex-col items-center gap-4">
            {youtubeVideoId ? (
              <YouTubePlayer
                key={`yt-${youtubeVideoId}`}
                videoId={youtubeVideoId}
                isHost={isHost}
                onHostSync={handleHostSync}
              />
            ) : (
              <VideoPlayer
                key={`vid-${videoUrl}`}
                ref={videoRef}
                src={videoUrl}
                subtitlesUrl={subtitlesUrl}
                isHost={isHost}
                onHostSync={handleHostSync}
              />
            )}

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
                Soporta links de YouTube y archivos directos MP4/Pixeldrain
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
