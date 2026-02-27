"use client";

import { useCallback, useEffect, useRef } from "react";
import { getVideoUrl } from "@/lib/api";

interface VideoPlayerProps {
  episodeIndex: number;
  cameraKey: string;
  frameIndex: number;
  totalFrames: number;
  fps: number;
  fromTimestamp: number;
  isPlaying: boolean;
  speed: number;
  /** Called during playback with the current frame index (only the primary camera). */
  onTimeUpdate?: (frameIndex: number) => void;
  /** Called when playback reaches the last frame of the episode. */
  onPlaybackEnd?: () => void;
  label?: string;
}

export function VideoPlayer({
  episodeIndex,
  cameraKey,
  frameIndex,
  totalFrames,
  fps,
  fromTimestamp,
  isPlaying,
  speed,
  onTimeUpdate,
  onPlaybackEnd,
  label,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isPlayingRef = useRef(false);
  isPlayingRef.current = isPlaying;

  const videoUrl = getVideoUrl(episodeIndex, cameraKey);

  // Seek when frameIndex changes externally (scrub / step / timeline click).
  // During playback, use a wide threshold so timeupdate feedback doesn't
  // cause seek fights, but intentional jumps (user clicking the timeline) still work.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || totalFrames === 0) return;

    const targetTime = fromTimestamp + frameIndex / fps;
    const drift = Math.abs(video.currentTime - targetTime);

    // When playing: only seek for large jumps (>0.3s ≈ 9 frames at 30fps).
    // When paused: seek precisely for frame-stepping.
    const threshold = isPlaying ? 0.3 : 0.5 / fps;
    if (drift > threshold) {
      video.currentTime = targetTime;
    }
  }, [frameIndex, fromTimestamp, fps, totalFrames, isPlaying]);

  // Play / pause
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  // Playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Smooth timeline tracking via requestAnimationFrame.
  // The native <video> timeupdate fires ~4x/sec which makes the timeline
  // look choppy. rAF polls at display rate; we emit once per actual video
  // frame change for smooth tracking without excess re-renders.
  // Also detects end-of-episode and stops playback.
  useEffect(() => {
    if (!isPlaying) return;
    const video = videoRef.current;
    if (!video) return;

    let rafId: number;
    let lastFrame = -1;
    const maxFrame = totalFrames - 1;

    const tick = () => {
      if (!isPlayingRef.current) return;
      const relativeTime = video.currentTime - fromTimestamp;
      const frame = Math.round(relativeTime * fps);
      const clamped = Math.max(0, Math.min(maxFrame, frame));

      if (onTimeUpdate && clamped !== lastFrame) {
        lastFrame = clamped;
        onTimeUpdate(clamped);
      }

      // Stop when we've reached or passed the last frame of this episode
      if (frame >= maxFrame) {
        video.pause();
        onPlaybackEnd?.();
        return;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying, onTimeUpdate, onPlaybackEnd, fromTimestamp, fps, totalFrames]);

  return (
    <div className="relative overflow-hidden bg-[#0B0B0D]">
      {label && (
        <div className="absolute top-2 right-2 z-10">
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium ${
              label === "success"
                ? "bg-[#7AE6A0]/80 text-[#0B0B0D]"
                : "bg-[#E87070]/80 text-[#D3D5FD]"
            }`}
          >
            {label}
          </span>
        </div>
      )}
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full h-auto bg-[#0B0B0D]"
        style={{ aspectRatio: "16/9" }}
        muted
        playsInline
        preload="auto"
      />
    </div>
  );
}
