"use client";

import { useEffect, useState } from "react";

interface CountdownProps {
  playAt: number;
  onComplete: () => void;
}

export default function Countdown({ playAt, onComplete }: CountdownProps) {
  const [remaining, setRemaining] = useState<number>(
    Math.max(0, Math.ceil((playAt - Date.now()) / 1000))
  );
  const [fraction, setFraction] = useState(1);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    if (completed) return;

    let rafId: number;

    const tick = () => {
      const diff = playAt - Date.now();

      if (diff <= 0) {
        setRemaining(0);
        setCompleted(true);
        onComplete();
        return;
      }

      setRemaining(Math.ceil(diff / 1000));
      setFraction((diff % 1000) / 1000);
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [playAt, onComplete, completed]);

  if (completed) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50 rounded-2xl">
      <div className="text-center">
        <div
          className="text-[10rem] sm:text-[14rem] font-black text-white tabular-nums select-none leading-none"
          style={{
            transform: `scale(${0.7 + fraction * 0.3})`,
            opacity: 0.4 + fraction * 0.6,
            textShadow:
              "0 0 80px rgba(168, 85, 247, 0.6), 0 0 160px rgba(168, 85, 247, 0.3)",
          }}
        >
          {remaining}
        </div>
        <p className="text-zinc-400 text-lg mt-4 animate-pulse">
          Preparando reproducción...
        </p>
      </div>
    </div>
  );
}
