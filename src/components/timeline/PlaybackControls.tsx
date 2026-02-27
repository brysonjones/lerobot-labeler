"use client";

interface PlaybackControlsProps {
  isPlaying: boolean;
  speed: number;
  onPlayPause: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  onSpeedChange: (speed: number) => void;
  onPrevEpisode: () => void;
  onNextEpisode: () => void;
}

const SPEEDS = [0.25, 0.5, 1, 2, 4];

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

function PauseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
    </svg>
  );
}

function SkipPrevIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
    </svg>
  );
}

function SkipNextIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
    </svg>
  );
}

function StepBackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 18V6l-8.5 6 8.5 6zm.5-6 8.5 6V6l-8.5 6z" />
    </svg>
  );
}

function StepForwardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
    </svg>
  );
}

export function PlaybackControls({
  isPlaying,
  speed,
  onPlayPause,
  onStepBack,
  onStepForward,
  onSpeedChange,
  onPrevEpisode,
  onNextEpisode,
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center justify-center gap-1">
      <button
        onClick={onPrevEpisode}
        className="text-[#929AAB] hover:text-[#D3D5FD] p-1.5 rounded transition-colors hover:bg-[#1e2028]"
        title="Previous episode ([)"
      >
        <SkipPrevIcon className="w-4 h-4" />
      </button>

      <button
        onClick={onStepBack}
        className="text-[#929AAB] hover:text-[#D3D5FD] p-1.5 rounded transition-colors hover:bg-[#1e2028]"
        title="Step back (Left arrow)"
      >
        <StepBackIcon className="w-4 h-4" />
      </button>

      <button
        onClick={onPlayPause}
        className="bg-[#2a2d38] hover:bg-[#474A56] text-[#D3D5FD] p-2 rounded-full transition-colors mx-1"
        title="Play/Pause (Space)"
      >
        {isPlaying ? (
          <PauseIcon className="w-5 h-5" />
        ) : (
          <PlayIcon className="w-5 h-5" />
        )}
      </button>

      <button
        onClick={onStepForward}
        className="text-[#929AAB] hover:text-[#D3D5FD] p-1.5 rounded transition-colors hover:bg-[#1e2028]"
        title="Step forward (Right arrow)"
      >
        <StepForwardIcon className="w-4 h-4" />
      </button>

      <button
        onClick={onNextEpisode}
        className="text-[#929AAB] hover:text-[#D3D5FD] p-1.5 rounded transition-colors hover:bg-[#1e2028]"
        title="Next episode (])"
      >
        <SkipNextIcon className="w-4 h-4" />
      </button>

      <div className="ml-4 flex items-center gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-1.5 py-0.5 rounded text-xs transition-colors ${
              speed === s
                ? "bg-[#D3D5FD] text-[#0B0B0D]"
                : "text-[#929AAB] hover:text-[#D3D5FD]"
            }`}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
