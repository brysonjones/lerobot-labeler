"use client";

import { useCallback, useEffect, useRef } from "react";
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
  const listRef = useRef<List>(null);

  // Scroll to keep the selected episode visible
  const selectedIdx = episodes.findIndex(
    (ep) => ep.episode_index === selectedEpisode
  );
  useEffect(() => {
    if (selectedIdx >= 0 && listRef.current) {
      listRef.current.scrollToItem(selectedIdx, "smart");
    }
  }, [selectedIdx]);

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
                className="opacity-30 group-hover:opacity-100 text-[#474A56] hover:text-[#E87070] transition-opacity"
                title="Remove episode (can be restored)"
              >
                <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2 4h12M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4M6.5 7v5M9.5 7v5M3.5 4l.5 9a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 12 13l.5-9" />
                </svg>
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
      ref={listRef}
      height={height}
      itemCount={episodes.length}
      itemSize={36}
      width="100%"
    >
      {Row}
    </List>
  );
}
