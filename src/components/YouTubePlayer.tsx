"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { SyncPayload } from "@/components/VideoPlayer";

interface YouTubePlayerProps {
  videoId: string;
  isHost: boolean;
  onHostSync?: (payload: SyncPayload) => void;
}

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

export default function YouTubePlayer({
  videoId,
  isHost,
  onHostSync,
}: YouTubePlayerProps) {
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const isSyncingFromRemote = useRef(false);

  // Load YouTube IFrame API script once
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (!window.YT) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const firstScriptTag = document.getElementsByTagName("script")[0];
      firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
    }

    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) return;

      if (playerRef.current) {
        playerRef.current.destroy();
      }

      playerRef.current = new window.YT.Player("youtube-iframe-target", {
        videoId,
        playerVars: {
          autoplay: 0,
          controls: isHost ? 1 : 0, // Viewers have native controls disabled to maintain sync
          disablekb: isHost ? 0 : 1,
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            setIsReady(true);
          },
          onStateChange: (event: any) => {
            if (!isHost || isSyncingFromRemote.current) return;

            const player = playerRef.current;
            if (!player) return;

            const time = player.getCurrentTime() || 0;

            // YT.PlayerState.PLAYING = 1
            if (event.data === window.YT.PlayerState.PLAYING) {
              onHostSync?.({
                action: "PLAY",
                currentTime: time,
                isPlaying: true,
                sentAt: Date.now(),
              });
            }
            // YT.PlayerState.PAUSED = 2
            else if (event.data === window.YT.PlayerState.PAUSED) {
              onHostSync?.({
                action: "PAUSE",
                currentTime: time,
                isPlaying: false,
                sentAt: Date.now(),
              });
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
      }
    };
  }, [videoId, isHost, onHostSync]);

  // Periodic check for host seek operations
  useEffect(() => {
    if (!isHost) return;

    let lastKnownTime = 0;
    const interval = setInterval(() => {
      const player = playerRef.current;
      if (!player || !player.getCurrentTime) return;

      const currentTime = player.getCurrentTime();
      // If time jumped by more than 1.8 seconds while playing, it was likely a seek
      if (Math.abs(currentTime - lastKnownTime) > 1.8 && lastKnownTime > 0) {
        const isPlaying = player.getPlayerState() === window.YT?.PlayerState?.PLAYING;
        onHostSync?.({
          action: "SEEK",
          currentTime,
          isPlaying,
          sentAt: Date.now(),
        });
      }
      lastKnownTime = currentTime;
    }, 600);

    return () => clearInterval(interval);
  }, [isHost, onHostSync]);

  // Handle external sync events coming from host (for viewers)
  const applyRemoteSync = useCallback((payload: SyncPayload) => {
    const player = playerRef.current;
    if (!player || !player.seekTo) return;

    const { action, currentTime, isPlaying, sentAt } = payload;
    const networkLag = Math.max(0, (Date.now() - sentAt) / 1000);
    const targetTime = isPlaying ? currentTime + networkLag : currentTime;

    isSyncingFromRemote.current = true;

    const playerTime = player.getCurrentTime() || 0;
    const diff = Math.abs(playerTime - targetTime);

    if (diff > 0.4 || action === "SEEK" || action === "RESTART") {
      player.seekTo(targetTime, true);
    }

    if (isPlaying) {
      player.playVideo?.();
    } else {
      player.pauseVideo?.();
    }

    setTimeout(() => {
      isSyncingFromRemote.current = false;
    }, 400);
  }, []);

  // Expose remote sync to parent via ref or window custom event
  useEffect(() => {
    const handleRemoteEvent = (e: CustomEvent<SyncPayload>) => {
      if (!isHost) {
        applyRemoteSync(e.detail);
      }
    };

    window.addEventListener("syncwatch:remote-yt-sync" as any, handleRemoteEvent);
    return () => {
      window.removeEventListener("syncwatch:remote-yt-sync" as any, handleRemoteEvent);
    };
  }, [isHost, applyRemoteSync]);

  return (
    <div
      ref={containerRef}
      className="w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/10 ring-1 ring-white/10 relative group"
    >
      <div id="youtube-iframe-target" className="w-full h-full" />

      {/* Viewer transparent touch blocker to prevent desync */}
      {!isHost && (
        <div
          className="absolute inset-0 z-20 cursor-default"
          title="El video está sincronizado con el anfitrión"
        />
      )}

      {/* Status Badges */}
      <div className="absolute top-4 left-4 flex items-center gap-2 pointer-events-none z-30">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-600/30 border border-red-500/40 text-red-200 text-xs backdrop-blur-md font-semibold">
          <span>▶ YouTube</span>
        </div>
        {isHost ? (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-yellow-500/20 border border-yellow-500/40 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <span className="text-xs font-semibold text-yellow-300">
              👑 Controlando en vivo
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 border border-white/10 backdrop-blur-md">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
            <span className="text-xs font-medium text-zinc-300">
              👁 Sincronizado
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
