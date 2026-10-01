"use client";

import {
  forwardRef,
  useEffect,
  useState,
  useRef,
  useCallback,
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
    const containerRef = useRef<HTMLDivElement>(null);
    const progressRef = useRef<HTMLDivElement>(null);
    const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();

    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [showControls, setShowControls] = useState(true);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [isDragging, setIsDragging] = useState(false);
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const [hoverX, setHoverX] = useState(0);

    useImperativeHandle(ref, () => videoRef.current as HTMLVideoElement, []);

    // Video event listeners
    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;

      const onTimeUpdate = () => {
        if (!isDragging) setCurrentTime(video.currentTime);
        if (video.buffered.length > 0) {
          setBuffered(video.buffered.end(video.buffered.length - 1));
        }
      };
      const onDurationChange = () => setDuration(video.duration || 0);
      const onPlay = () => setIsPlaying(true);
      const onPause = () => setIsPlaying(false);
      const onEnded = () => setIsPlaying(false);

      video.addEventListener("timeupdate", onTimeUpdate);
      video.addEventListener("durationchange", onDurationChange);
      video.addEventListener("loadedmetadata", onDurationChange);
      video.addEventListener("play", onPlay);
      video.addEventListener("pause", onPause);
      video.addEventListener("ended", onEnded);
      video.addEventListener("progress", onTimeUpdate);

      return () => {
        video.removeEventListener("timeupdate", onTimeUpdate);
        video.removeEventListener("durationchange", onDurationChange);
        video.removeEventListener("loadedmetadata", onDurationChange);
        video.removeEventListener("play", onPlay);
        video.removeEventListener("pause", onPause);
        video.removeEventListener("ended", onEnded);
        video.removeEventListener("progress", onTimeUpdate);
      };
    }, [isDragging]);

    // Fullscreen listener
    useEffect(() => {
      const onFsChange = () =>
        setIsFullscreen(!!document.fullscreenElement);
      document.addEventListener("fullscreenchange", onFsChange);
      return () =>
        document.removeEventListener("fullscreenchange", onFsChange);
    }, []);

    // Auto-hide controls
    const resetHideTimer = useCallback(() => {
      setShowControls(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      if (isPlaying) {
        hideTimerRef.current = setTimeout(() => setShowControls(false), 3000);
      }
    }, [isPlaying]);

    useEffect(() => {
      if (!isPlaying) {
        setShowControls(true);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      }
    }, [isPlaying]);

    // Format time
    const formatTime = (t: number) => {
      if (!isFinite(t) || t < 0) return "0:00";
      const h = Math.floor(t / 3600);
      const m = Math.floor((t % 3600) / 60);
      const s = Math.floor(t % 60);
      if (h > 0)
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
      return `${m}:${s.toString().padStart(2, "0")}`;
    };

    // --- HOST CONTROLS ---

    const togglePlay = () => {
      if (!isHost) return;
      const video = videoRef.current;
      if (!video) return;

      if (video.paused || video.ended) {
        video.play().catch(console.error);
        onHostAction?.("PLAY", video.currentTime);
      } else {
        video.pause();
        onHostAction?.("PAUSE", video.currentTime);
      }
    };

    const seekTo = (time: number) => {
      if (!isHost) return;
      const video = videoRef.current;
      if (!video) return;

      video.currentTime = time;
      setCurrentTime(time);
      onHostAction?.("SEEK", time);
    };

    const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isHost || !progressRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      seekTo(ratio * duration);
    };

    const handleProgressMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!isHost) return;
      setIsDragging(true);
      handleProgressClick(e);

      const onMove = (ev: MouseEvent) => {
        if (!progressRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        setCurrentTime(ratio * duration);
      };

      const onUp = (ev: MouseEvent) => {
        if (!progressRef.current) return;
        const rect = progressRef.current.getBoundingClientRect();
        const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
        setIsDragging(false);
        seekTo(ratio * duration);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    };

    const handleProgressHover = (e: React.MouseEvent<HTMLDivElement>) => {
      if (!progressRef.current) return;
      const rect = progressRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      setHoverTime(ratio * duration);
      setHoverX(e.clientX - rect.left);
    };

    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = parseFloat(e.target.value);
      setVolume(val);
      setIsMuted(val === 0);
      if (videoRef.current) {
        videoRef.current.volume = val;
        videoRef.current.muted = val === 0;
      }
    };

    const toggleMute = () => {
      if (!videoRef.current) return;
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      videoRef.current.muted = newMuted;
    };

    const toggleFullscreen = () => {
      if (!containerRef.current) return;
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        containerRef.current.requestFullscreen();
      }
    };

    const handleVideoClick = () => {
      if (isHost) togglePlay();
    };

    const handleDoubleClick = () => {
      if (isHost) toggleFullscreen();
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;

    return (
      <div
        ref={containerRef}
        className={`relative w-full max-w-5xl aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl shadow-purple-500/10 ring-1 ring-white/10 group ${
          isFullscreen ? "!max-w-none !rounded-none" : ""
        }`}
        onMouseMove={resetHideTimer}
        onMouseLeave={() => isPlaying && setShowControls(false)}
      >
        <video
          ref={videoRef}
          src={src}
          preload="auto"
          playsInline
          className="w-full h-full object-contain cursor-pointer"
          onClick={handleVideoClick}
          onDoubleClick={handleDoubleClick}
        />

        {/* Big center play button when paused */}
        {isHost && !isPlaying && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer"
            onClick={togglePlay}
          >
            <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center hover:bg-white/20 transition-all duration-200 hover:scale-110">
              <svg
                className="w-10 h-10 text-white ml-1"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
        )}

        {/* Bottom controls bar */}
        {isHost && (
          <div
            className={`absolute bottom-0 left-0 right-0 transition-opacity duration-300 ${
              showControls ? "opacity-100" : "opacity-0 pointer-events-none"
            }`}
          >
            {/* Gradient background */}
            <div className="bg-gradient-to-t from-black/90 via-black/60 to-transparent pt-20 pb-3 px-4">
              {/* Progress bar */}
              <div
                ref={progressRef}
                className="relative w-full h-1 group/bar cursor-pointer mb-3 hover:h-1.5 transition-all"
                onClick={handleProgressClick}
                onMouseDown={handleProgressMouseDown}
                onMouseMove={handleProgressHover}
                onMouseLeave={() => setHoverTime(null)}
              >
                {/* Background */}
                <div className="absolute inset-0 bg-white/20 rounded-full" />
                {/* Buffered */}
                <div
                  className="absolute inset-y-0 left-0 bg-white/30 rounded-full"
                  style={{ width: `${bufferedPercent}%` }}
                />
                {/* Progress */}
                <div
                  className="absolute inset-y-0 left-0 bg-red-600 rounded-full"
                  style={{ width: `${progress}%` }}
                />
                {/* Scrubber dot */}
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-red-600 rounded-full opacity-0 group-hover/bar:opacity-100 transition-opacity shadow-lg"
                  style={{ left: `${progress}%`, transform: "translate(-50%, -50%)" }}
                />
                {/* Hover time tooltip */}
                {hoverTime !== null && (
                  <div
                    className="absolute -top-8 bg-black/90 text-white text-xs px-2 py-1 rounded pointer-events-none"
                    style={{ left: `${hoverX}px`, transform: "translateX(-50%)" }}
                  >
                    {formatTime(hoverTime)}
                  </div>
                )}
              </div>

              {/* Controls row */}
              <div className="flex items-center gap-3">
                {/* Play/Pause */}
                <button
                  onClick={togglePlay}
                  className="text-white hover:text-white/80 transition-colors"
                >
                  {isPlaying ? (
                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
                    </svg>
                  ) : (
                    <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>

                {/* Volume */}
                <div className="flex items-center gap-1 group/vol">
                  <button
                    onClick={toggleMute}
                    className="text-white hover:text-white/80 transition-colors"
                  >
                    {isMuted || volume === 0 ? (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.21.05-.43.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.796 8.796 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                      </svg>
                    ) : volume < 0.5 ? (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M18.5 12A4.5 4.5 0 0016 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77 0-4.28-2.99-7.86-7-8.77z" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="w-0 group-hover/vol:w-20 transition-all duration-200 accent-white h-1 cursor-pointer opacity-0 group-hover/vol:opacity-100"
                  />
                </div>

                {/* Time */}
                <span className="text-white/70 text-sm tabular-nums select-none">
                  {formatTime(currentTime)}
                  <span className="text-white/40"> / </span>
                  {formatTime(duration)}
                </span>

                <div className="flex-1" />

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="text-white hover:text-white/80 transition-colors"
                >
                  {isFullscreen ? (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0h4M4 4v4m11-1l5-5m0 0h-4m4 0v4M9 15l-5 5m0 0h4m-4 0v-4m16 0v4m0 0h-4m4 0l-5-5" />
                    </svg>
                  ) : (
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
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
