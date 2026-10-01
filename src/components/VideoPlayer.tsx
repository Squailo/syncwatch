"use client";

import {
  forwardRef,
  useEffect,
  useState,
  useRef,
  useImperativeHandle,
  useCallback,
} from "react";

export type HostActionType = "PLAY" | "PAUSE" | "SEEK" | "RESTART";

export interface SyncPayload {
  action: HostActionType;
  currentTime: number;
  isPlaying: boolean;
  sentAt: number;
}

interface VideoPlayerProps {
  src: string;
  subtitlesUrl?: string;
  isHost: boolean;
  onHostSync?: (payload: SyncPayload) => void;
}

const formatTime = (seconds: number) => {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
};

/** Convert SRT format to valid WebVTT format */
function convertSrtToVtt(srtText: string): string {
  let vtt = "WEBVTT\n\n" + srtText.replace(/\r\n|\r/g, "\n").trim();
  // Replace comma millisecond separators with dots (e.g. 00:01:23,456 --> 00:01:23.456)
  vtt = vtt.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");
  return vtt;
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, subtitlesUrl, isHost, onHostSync }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const progressBarRef = useRef<HTMLDivElement>(null);

    // Playback state
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [bufferedEnd, setBufferedEnd] = useState(0);
    const [isEnded, setIsEnded] = useState(false);

    // Audio state (local to user)
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [prevVolume, setPrevVolume] = useState(1);

    // Subtitles state
    const [vttBlobUrl, setVttBlobUrl] = useState<string | null>(null);
    const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
    const [hasSubtitles, setHasSubtitles] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);

    // Seeking & Hover preview
    const [isDragging, setIsDragging] = useState(false);
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverPosition, setHoverPosition] = useState<number>(0);

    // UI visibility
    const [showControls, setShowControls] = useState(true);
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [rippleIcon, setRippleIcon] = useState<"play" | "pause" | "replay" | null>(null);

    // Expose video element to parent ref
    useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, []);

    // Broadcast helper
    const broadcastSync = useCallback(
      (action: HostActionType, time: number, playing: boolean) => {
        if (!isHost || !onHostSync) return;
        onHostSync({
          action,
          currentTime: time,
          isPlaying: playing,
          sentAt: Date.now(),
        });
      },
      [isHost, onHostSync]
    );

    // Load & convert subtitles from Supabase URL (.srt or .vtt)
    useEffect(() => {
      let currentBlobUrl: string | null = null;

      if (!subtitlesUrl) {
        setHasSubtitles(false);
        setVttBlobUrl(null);
        return;
      }

      const cleanSubUrl = subtitlesUrl.trim().replace(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i, "pixeldrain.com/api/file/$1");
      const targetUrl = cleanSubUrl.includes("pixeldrain.com")
        ? `/api/proxy?url=${encodeURIComponent(cleanSubUrl)}`
        : cleanSubUrl;

      fetch(targetUrl)
        .then((res) => {
          if (!res.ok) throw new Error("Error loading subtitles");
          return res.text();
        })
        .then((rawText) => {
          // If already WebVTT, use directly; otherwise convert from SRT
          const isVtt = rawText.trim().startsWith("WEBVTT");
          const vttContent = isVtt ? rawText : convertSrtToVtt(rawText);

          const blob = new Blob([vttContent], { type: "text/vtt" });
          currentBlobUrl = URL.createObjectURL(blob);
          setVttBlobUrl(currentBlobUrl);
          setHasSubtitles(true);
          setSubtitlesEnabled(true);
        })
        .catch((err) => {
          console.warn("Could not load subtitles file:", err);
          setHasSubtitles(false);
        });

      return () => {
        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl);
        }
      };
    }, [subtitlesUrl]);

    // Handle dropping a local .srt file directly onto player
    const handleFileDrop = (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        if (file.name.endsWith(".srt") || file.name.endsWith(".vtt")) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const content = event.target?.result as string;
            const isVtt = content.trim().startsWith("WEBVTT");
            const vttContent = isVtt ? content : convertSrtToVtt(content);
            const blob = new Blob([vttContent], { type: "text/vtt" });
            const url = URL.createObjectURL(blob);
            setVttBlobUrl(url);
            setHasSubtitles(true);
            setSubtitlesEnabled(true);
          };
          reader.readAsText(file);
        }
      }
    };

    // Toggle subtitles visibility [CC]
    const handleToggleSubtitles = useCallback(() => {
      const video = videoRef.current;
      const nextState = !subtitlesEnabled;
      setSubtitlesEnabled(nextState);

      if (video && video.textTracks && video.textTracks.length > 0) {
        for (let i = 0; i < video.textTracks.length; i++) {
          video.textTracks[i].mode = nextState ? "showing" : "hidden";
        }
      }
    }, [subtitlesEnabled]);

    // Trigger ripple animation
    const triggerRipple = (type: "play" | "pause" | "replay") => {
      setRippleIcon(type);
      setTimeout(() => setRippleIcon(null), 500);
    };

    // Auto-hide controls when playing and idle
    const resetControlsTimer = useCallback(() => {
      setShowControls(true);
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
      if (isPlaying && !isDragging) {
        controlsTimeoutRef.current = setTimeout(() => {
          setShowControls(false);
        }, 2600);
      }
    }, [isPlaying, isDragging]);

    // Handle Play / Pause toggle
    const handleTogglePlay = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;

      if (!isHost) return;

      if (video.ended || video.currentTime >= video.duration - 0.2) {
        video.currentTime = 0;
        video
          .play()
          .then(() => {
            setIsEnded(false);
            setIsPlaying(true);
            triggerRipple("replay");
            broadcastSync("RESTART", 0, true);
          })
          .catch(console.error);
        return;
      }

      if (video.paused) {
        video
          .play()
          .then(() => {
            setIsPlaying(true);
            triggerRipple("play");
            broadcastSync("PLAY", video.currentTime, true);
          })
          .catch(console.error);
      } else {
        video.pause();
        setIsPlaying(false);
        triggerRipple("pause");
        broadcastSync("PAUSE", video.currentTime, false);
      }
    }, [isHost, broadcastSync]);

    // Skip forward / backward
    const handleSkip = useCallback(
      (seconds: number) => {
        const video = videoRef.current;
        if (!video || !isHost) return;

        const newTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
        video.currentTime = newTime;
        setCurrentTime(newTime);
        broadcastSync("SEEK", newTime, !video.paused);
      },
      [isHost, broadcastSync]
    );

    // Fullscreen toggle
    const handleFullscreen = useCallback(() => {
      const container = containerRef.current;
      if (!container) return;

      if (!document.fullscreenElement) {
        container.requestFullscreen?.().catch(console.error);
      } else {
        document.exitFullscreen?.().catch(console.error);
      }
    }, []);

    // Volume change
    const handleVolumeChange = (newVolume: number) => {
      const video = videoRef.current;
      if (!video) return;
      const vol = Math.max(0, Math.min(1, newVolume));
      video.volume = vol;
      video.muted = vol === 0;
      setVolume(vol);
      setIsMuted(vol === 0);
    };

    const handleToggleMute = useCallback(() => {
      const video = videoRef.current;
      if (!video) return;

      if (isMuted || volume === 0) {
        const restore = prevVolume > 0 ? prevVolume : 0.8;
        video.muted = false;
        video.volume = restore;
        setVolume(restore);
        setIsMuted(false);
      } else {
        setPrevVolume(volume);
        video.muted = true;
        video.volume = 0;
        setVolume(0);
        setIsMuted(true);
      }
    }, [isMuted, volume, prevVolume]);

    // Calculate time from mouse position
    const calculateTimeFromEvent = (e: MouseEvent | TouchEvent | React.MouseEvent) => {
      if (!progressBarRef.current || !duration) return 0;
      const rect = progressBarRef.current.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
      const offsetX = Math.max(0, Math.min(rect.width, clientX - rect.left));
      return (offsetX / rect.width) * duration;
    };

    // Scrubber click & drag
    const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isHost) return;
      const video = videoRef.current;
      if (!video) return;

      const newTime = calculateTimeFromEvent(e);
      video.currentTime = newTime;
      setCurrentTime(newTime);
      setIsEnded(false);
      broadcastSync("SEEK", newTime, !video.paused);
    };

    const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isHost) return;
      e.preventDefault();
      setIsDragging(true);
      (e.target as HTMLElement).setPointerCapture(e.pointerId);

      const newTime = calculateTimeFromEvent(e);
      setCurrentTime(newTime);
    };

    const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
      if (!progressBarRef.current || !duration) return;
      const rect = progressBarRef.current.getBoundingClientRect();
      const offsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
      const percentage = (offsetX / rect.width) * 100;
      const t = (offsetX / rect.width) * duration;

      setHoverTime(t);
      setHoverPosition(percentage);

      if (isDragging && isHost) {
        setCurrentTime(t);
      }
    };

    const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
      if (isDragging && isHost) {
        setIsDragging(false);
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }

        const video = videoRef.current;
        if (!video) return;
        const newTime = calculateTimeFromEvent(e);
        video.currentTime = newTime;
        setCurrentTime(newTime);
        setIsEnded(false);
        broadcastSync("SEEK", newTime, !video.paused);
      }
    };

    // Native video listeners
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const onTimeUpdate = () => {
        if (!isDragging) {
          setCurrentTime(video.currentTime);
        }
        if (video.buffered.length > 0) {
          try {
            setBufferedEnd(video.buffered.end(video.buffered.length - 1));
          } catch {
            // ignore
          }
        }
      };

      const onLoadedMetadata = () => {
        setDuration(video.duration || 0);
      };

      const onDurationChange = () => {
        setDuration(video.duration || 0);
      };

      const onPlay = () => {
        setIsPlaying(true);
        setIsEnded(false);
      };

      const onPause = () => {
        setIsPlaying(false);
      };

      const onEnded = () => {
        setIsPlaying(false);
        setIsEnded(true);
        setShowControls(true);
      };

      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      video.addEventListener("durationchange", onDurationChange);
      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("ended", onEnded);

      return () => {
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
        video.removeEventListener("durationchange", onDurationChange);
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("ended", onEnded);
      };
    }, [isDragging]);

    // Keyboard Shortcuts
    useEffect(() => {
      const onKeyDown = (e: KeyboardEvent) => {
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag === "input" || tag === "textarea") return;

        if (e.code === "Space" || e.key === "k" || e.key === "K") {
          e.preventDefault();
          if (isHost) handleTogglePlay();
        } else if (e.code === "ArrowRight" || e.key === "l" || e.key === "L") {
          e.preventDefault();
          if (isHost) handleSkip(10);
        } else if (e.code === "ArrowLeft" || e.key === "j" || e.key === "J") {
          e.preventDefault();
          if (isHost) handleSkip(-10);
        } else if (e.key === "m" || e.key === "M") {
          e.preventDefault();
          handleToggleMute();
        } else if (e.key === "f" || e.key === "F") {
          e.preventDefault();
          handleFullscreen();
        } else if (e.key === "c" || e.key === "C") {
          e.preventDefault();
          handleToggleSubtitles();
        }
      };

      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [isHost, handleTogglePlay, handleSkip, handleToggleMute, handleFullscreen, handleToggleSubtitles]);

    const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferPercent = duration > 0 ? (bufferedEnd / duration) * 100 : 0;
    const cleanVideoUrl = src ? src.trim().replace(/pixeldrain\.com\/u\/([a-zA-Z0-9_-]+)/i, "pixeldrain.com/api/file/$1") : "";
    const normalizedSrc = cleanVideoUrl.includes("pixeldrain.com")
      ? `/api/proxy?url=${encodeURIComponent(cleanVideoUrl)}`
      : cleanVideoUrl;

    return (
      <div
        ref={containerRef}
        onMouseMove={resetControlsTimer}
        onMouseEnter={() => setShowControls(true)}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragOver(true);
        }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleFileDrop}
        className={`w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/10 ring-1 ring-white/10 relative group select-none flex items-center justify-center transition-all ${
          isDragOver ? "ring-2 ring-purple-500 bg-purple-950/20" : ""
        }`}
      >
        <video
          ref={videoRef}
          src={normalizedSrc}
          preload="auto"
          playsInline
          crossOrigin="anonymous"
          onClick={isHost ? handleTogglePlay : undefined}
          className={`w-full h-full object-contain bg-black ${
            isHost ? "cursor-pointer" : "cursor-default"
          }`}
        >
          {vttBlobUrl && (
            <track
              label="Español"
              kind="subtitles"
              srcLang="es"
              src={vttBlobUrl}
              default={subtitlesEnabled}
            />
          )}
        </video>

        {/* Drag & Drop Feedback Overlay */}
        {isDragOver && (
          <div className="absolute inset-0 bg-purple-900/60 backdrop-blur-sm flex flex-col items-center justify-center text-white z-50 pointer-events-none">
            <span className="text-4xl mb-2">📄</span>
            <p className="font-bold text-lg">Suelta tu archivo .srt aquí</p>
            <p className="text-xs text-purple-200">Se cargarán los subtítulos en español</p>
          </div>
        )}

        {/* Center Ripple Feedback */}
        {rippleIcon && (
          <div className="absolute pointer-events-none w-20 h-20 rounded-full bg-black/60 backdrop-blur-md flex items-center justify-center animate-ping text-white z-40">
            {rippleIcon === "play" && (
              <svg className="w-10 h-10 ml-1" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
            {rippleIcon === "pause" && (
              <svg className="w-10 h-10" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
              </svg>
            )}
            {rippleIcon === "replay" && (
              <svg className="w-10 h-10" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
          </div>
        )}

        {/* Top Badges */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-none z-30">
          <div className="flex items-center gap-2">
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

            {hasSubtitles && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs backdrop-blur-md">
                <span>💬 Subtítulos ES</span>
              </div>
            )}
          </div>
        </div>

        {/* Controls Overlay */}
        <div
          className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent flex flex-col justify-end transition-opacity duration-300 pointer-events-auto z-30 ${
            showControls || !isPlaying || isDragging ? "opacity-100" : "opacity-0 pointer-events-none"
          }`}
        >
          {/* Progress Bar (YouTube Style) */}
          <div
            ref={progressBarRef}
            onClick={isHost ? handleProgressBarClick : undefined}
            onPointerDown={isHost ? handlePointerDown : undefined}
            onPointerMove={isHost ? handlePointerMove : undefined}
            onPointerUp={isHost ? handlePointerUp : undefined}
            onMouseLeave={() => setHoverTime(null)}
            className={`relative w-full h-8 flex items-center px-4 group/bar ${
              isHost ? "cursor-pointer" : "cursor-default"
            }`}
          >
            {/* Hover Tooltip */}
            {isHost && hoverTime !== null && (
              <div
                className="absolute -top-7 transform -translate-x-1/2 px-2 py-0.5 rounded bg-black/90 border border-white/20 text-[11px] font-mono text-white pointer-events-none z-40 whitespace-nowrap shadow-lg"
                style={{ left: `${hoverPosition}%` }}
              >
                {formatTime(hoverTime)}
              </div>
            )}

            {/* Track Background */}
            <div className="relative w-full h-1 group-hover/bar:h-2 transition-all duration-150 bg-white/20 rounded-full overflow-visible">
              {/* Buffer Bar */}
              <div
                className="absolute inset-y-0 left-0 bg-white/40 rounded-full transition-all duration-200"
                style={{ width: `${Math.min(100, bufferPercent)}%` }}
              />

              {/* Played Progress Bar (YouTube Red) */}
              <div
                className="absolute inset-y-0 left-0 bg-red-600 rounded-full"
                style={{ width: `${Math.min(100, progressPercent)}%` }}
              />

              {/* Scrubber Knob */}
              {isHost && (
                <div
                  className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 bg-red-600 rounded-full shadow-md transition-transform duration-100 ${
                    isDragging ? "scale-150" : "group-hover/bar:scale-125 scale-0"
                  }`}
                  style={{ left: `${Math.min(100, progressPercent)}%` }}
                />
              )}
            </div>
          </div>

          {/* Control Buttons Row */}
          <div className="px-4 pb-3 pt-1 flex items-center justify-between text-white">
            <div className="flex items-center gap-3 sm:gap-4">
              {/* Play / Pause / Replay */}
              {isHost ? (
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  title={isEnded ? "Reiniciar (Espacio)" : isPlaying ? "Pausar (Espacio)" : "Reproducir (Espacio)"}
                  className="p-1.5 rounded-lg hover:bg-white/10 text-white transition-colors"
                >
                  {isEnded ? (
                    <svg className="w-7 h-7" fill="none" stroke="currentColor" strokeWidth={2.2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  ) : isPlaying ? (
                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
              ) : (
                <div className="p-1.5 text-zinc-500 cursor-not-allowed" title="Controlado por el anfitrión">
                  {isPlaying ? (
                    <svg className="w-7 h-7 text-green-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg className="w-7 h-7 text-zinc-500" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </div>
              )}

              {/* Skip Buttons (Host Only) */}
              {isHost && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSkip(-10)}
                    title="Retroceder 10s (J)"
                    className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSkip(10)}
                    title="Adelantar 10s (L)"
                    className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11.933 12.8a1 1 0 000-1.6L6.6 7.2A1 1 0 005 8v8a1 1 0 001.6.8l5.333-4zM19.933 12.8a1 1 0 000-1.6l-5.333-4A1 1 0 0013 8v8a1 1 0 001.6.8l5.333-4z" />
                    </svg>
                  </button>
                </>
              )}

              {/* Volume Slider */}
              <div className="flex items-center gap-2 group/vol">
                <button
                  type="button"
                  onClick={handleToggleMute}
                  title="Silenciar (M)"
                  className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
                >
                  {isMuted || volume === 0 ? (
                    <svg className="w-6 h-6 text-red-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                    </svg>
                  ) : volume < 0.5 ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    </svg>
                  )}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.02}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  className="w-0 group-hover/vol:w-20 transition-all duration-200 accent-white h-1 bg-white/30 rounded-lg cursor-pointer opacity-0 group-hover/vol:opacity-100"
                />
              </div>

              {/* Time Display */}
              <div className="text-xs sm:text-sm font-mono text-zinc-300 tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span className="text-zinc-600 mx-1.5">/</span>
                <span className="text-zinc-400">{formatTime(duration)}</span>
              </div>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2 sm:gap-3">
              {/* Subtitles Button [CC] */}
              {hasSubtitles && (
                <button
                  type="button"
                  onClick={handleToggleSubtitles}
                  title={`Subtítulos: ${subtitlesEnabled ? "Activados" : "Desactivados"} (C)`}
                  className={`px-2 py-1 rounded text-xs font-bold font-mono transition-all flex items-center justify-center ${
                    subtitlesEnabled
                      ? "bg-red-600 text-white shadow-sm shadow-red-600/30"
                      : "text-zinc-400 hover:text-white hover:bg-white/10"
                  }`}
                >
                  CC
                </button>
              )}

              {/* Fullscreen Button */}
              <button
                type="button"
                onClick={handleFullscreen}
                title="Pantalla Completa (F)"
                className="p-1.5 rounded-lg hover:bg-white/10 text-zinc-300 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
