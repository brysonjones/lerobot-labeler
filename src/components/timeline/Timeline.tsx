"use client";

interface TimelineProps {
  currentFrame: number;
  totalFrames: number;
  onSeek: (frame: number) => void;
  fps: number;
}

export function Timeline({ currentFrame, totalFrames, onSeek, fps }: TimelineProps) {
  const progress = totalFrames > 0 ? (currentFrame / (totalFrames - 1)) * 100 : 0;
  const currentTime = fps > 0 ? (currentFrame / fps).toFixed(2) : "0.00";
  const totalTime = fps > 0 ? ((totalFrames - 1) / fps).toFixed(2) : "0.00";
  const maxFrame = Math.max(totalFrames - 1, 0);
  const jumpSize = Math.max(1, Math.round(maxFrame * 0.1));

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const delta = e.key === "ArrowRight" ? jumpSize : -jumpSize;
      onSeek(Math.max(0, Math.min(maxFrame, currentFrame + delta)));
    }
  };

  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[#929AAB] font-mono w-16 text-right">
        {currentTime}s
      </span>
      <div className="relative flex-1 h-8 flex items-center">
        <input
          type="range"
          min={0}
          max={maxFrame}
          value={currentFrame}
          onChange={(e) => onSeek(parseInt(e.target.value, 10))}
          onKeyDown={handleKeyDown}
          className="w-full h-1.5 bg-[#2a2d38] rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3.5
            [&::-webkit-slider-thumb]:h-3.5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-[#D3D5FD]
            [&::-webkit-slider-thumb]:hover:bg-[#A8ABE0]
            [&::-webkit-slider-thumb]:transition-colors"
          style={{
            background: `linear-gradient(to right, #D3D5FD ${progress}%, #2a2d38 ${progress}%)`,
          }}
        />
      </div>
      <span className="text-xs text-[#929AAB] font-mono w-16">
        {totalTime}s
      </span>
      <span className="text-xs text-[#474A56] font-mono">
        {currentFrame}/{totalFrames - 1}
      </span>
    </div>
  );
}
