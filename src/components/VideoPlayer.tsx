"use client";

import {
  forwardRef,
  useEffect,
  useState,
  useRef,
  useImperativeHandle,
} from "react";

export type HostAction = "PLAY" | "PAUSE" | "SEEK";

interface VideoPlayerProps {
  src: string;
  isHost: boolean;
  onHostAction?: (action: HostAction, currentTime: number) => void;
}

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  ({ src, isHost, onHostAction }, ref) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [isSeeking, setIsSeeking] = useState(false);

    useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, []);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const onTimeUpdate = () => {
        if (!isSeeking) setCurrentTime(video.currentTime);
      };
      const onDurationChange = () => setDuration(video.duration || 0);
      const onPlay = () => setIsPlaying(true);
      const onPause = () => setIsPlaying(false);
      const onLoaded = () => setDuration(video.duration || 0);

      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("durationchange", onDurationChange);
      video.addEventListener("loadedmetadata", onLoaded);
      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);

      return () => {
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("durationchange", onDurationChange);
        video.removeEventListener("loadedmetadata", onLoaded);
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
      };
    }, [isSeeking]);

    const formatTime = (t: number) => {
      if (!isFinite(t)) return "0:00";
      const m = Math.floor(t / 60);
      const s = Math.floor(t % 60);
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    const handlePlayPause = () => {
      if (!isHost || !onHostAction) return;
      const video = videoRef.current;
      if (!video) return;

      if (isPlaying) {
        onHostAction("PAUSE", video.currentTime);
      } else {
        onHostAction("PLAY", video.currentTime);
      }
    };

    const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setCurrentTime(parseFloat(e.target.value));
    };

    const handleSeekStart = () => {
      setIsSeeking(true);
    };

    const handleSeekEnd = (e: React.MouseEvent | React.TouchEvent) => {
      setIsSeeking(false);
      if (!isHost || !onHostAction) return;
      const value = parseFloat((e.target as HTMLInputElement).value);
      onHostAction("SEEK", value);
    };

    const handleFullscreen = () => {
      const container = videoRef.current?.parentElement;
      if (container?.requestFullscreen) {
        container.requestFullscreen();
      } else {
        videoRef.current?.requestFullscreen?.();
      }
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

    return (
      <div className="w-full max-w-5xl aspect-video bg-zinc-900 rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/10 ring-1 ring-white/10 relative group">
        <video
          ref={videoRef}
          src={src}
          preload="auto"
          playsInline
          className="w-full h-full object-contain bg-black"
        />

        {/* Host controls */}
        {isHost && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-16 pb-4 px-4 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            {/* Progress bar */}
            <div className="relative w-full h-1.5 mb-4 group/bar cursor-pointer">
              <div className="absolute inset-0 bg-zinc-700 rounded-full" />
              <div
                className="absolute inset-y-0 left-0 bg-purple-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeekChange}
                onMouseDown={handleSeekStart}
                onMouseUp={handleSeekEnd}
                onTouchStart={handleSeekStart}
                onTouchEnd={handleSeekEnd}
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-4">
              {/* Play/Pause */}
              <button
                onClick={handlePlayPause}
                className="text-white hover:text-purple-400 transition-colors"
              >
                {isPlaying ? (
                  <svg
                    className="w-8 h-8"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                  </svg>
                ) : (
                  <svg
                    className="w-8 h-8"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>

              {/* Time */}
              <span className="text-sm text-zinc-300 tabular-nums">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>

              <div className="flex-1" />

              {/* Host badge */}
              <span className="text-xs text-yellow-400/60">
                👑 Controles de anfitrión
              </span>

              {/* Fullscreen */}
              <button
                onClick={handleFullscreen}
                className="text-white hover:text-purple-400 transition-colors"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Big play button overlay for host when paused */}
        {isHost && !isPlaying && (
          <button
            onClick={handlePlayPause}
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <div className="w-20 h-20 rounded-full bg-purple-600/80 flex items-center justify-center hover:bg-purple-500/80 transition-colors">
              <svg
                className="w-10 h-10 text-white ml-1"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        )}

        {/* Viewer badge */}
        {!isHost && (
          <div className="absolute top-4 right-4 px-3 py-1.5 rounded-full bg-black/60 text-xs text-zinc-400 backdrop-blur-sm">
            👁 Espectador
          </div>
        )}
      </div>
    );
  }
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
