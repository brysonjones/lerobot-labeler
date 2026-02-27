"use client";

import { useCallback } from "react";
import { FixedSizeList as List } from "react-window";
import type { EpisodeSummary } from "@/lib/types";

interface EpisodeListProps {
  episodes: EpisodeSummary[];
  selectedEpisode: number | null;
  onSelectEpisode: (index: number) => void;
  onDeleteEpisode?: (index: number) => void;
  height: number;
  fps: number;
}

function formatDuration(frames: number, fps: number): string {
  if (fps <= 0) return `${frames}f`;
  const totalSeconds = frames / fps;
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);

  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  if (m > 0) {
    return `${m}:${String(s).padStart(2, "0")}`;
  }
  return `0:${String(s).padStart(2, "0")}`;
}

function getLabelStyle(label: string | null, isSelected: boolean): string {
  if (label === "success") {
    return isSelected
      ? "bg-[#7AE6A0]/20 text-[#7AE6A0] border-l-2 border-[#7AE6A0]"
      : "bg-[#7AE6A0]/8 text-[#7AE6A0]/80 hover:bg-[#7AE6A0]/15 border-l-2 border-[#7AE6A0]/50";
  }
  if (label === "failure") {
    return isSelected
      ? "bg-[#E87070]/20 text-[#E87070] border-l-2 border-[#E87070]"
      : "bg-[#E87070]/8 text-[#E87070]/80 hover:bg-[#E87070]/15 border-l-2 border-[#E87070]/50";
  }
  return isSelected
    ? "bg-[#D3D5FD]/10 text-[#D3D5FD] border-l-2 border-[#D3D5FD]"
    : "text-[#929AAB] hover:bg-[#161821] hover:text-[#D3D5FD] border-l-2 border-transparent";
}

export function EpisodeList({
  episodes,
  selectedEpisode,
  onSelectEpisode,
  onDeleteEpisode,
  height,
  fps,
}: EpisodeListProps) {
  const Row = useCallback(
    ({ index, style }: { index: number; style: React.CSSProperties }) => {
      const ep = episodes[index];
      const isSelected = ep.episode_index === selectedEpisode;

      return (
        <div style={style} className="group">
          <button
            onClick={() => onSelectEpisode(ep.episode_index)}
            className={`w-full text-left px-3 py-1.5 flex items-center gap-2 text-sm transition-colors ${getLabelStyle(ep.label ?? null, isSelected)}`}
          >
            <span className="font-mono text-xs">#{ep.episode_index + 1}</span>
            <span className="text-[inherit] opacity-50 text-xs ml-auto">
              {formatDuration(ep.length, fps)}
            </span>
            {onDeleteEpisode && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteEpisode(ep.episode_index);
                }}
                className="opacity-0 group-hover:opacity-100 text-[#474A56] hover:text-[#E87070] text-xs px-0.5 transition-opacity"
                title="Remove episode (can be restored)"
              >
                ✕
              </span>
            )}
          </button>
        </div>
      );
    },
    [episodes, selectedEpisode, onSelectEpisode, onDeleteEpisode, fps]
  );

  return (
    <List
      height={height}
      itemCount={episodes.length}
      itemSize={36}
      width="100%"
    >
      {Row}
    </List>
  );
}
