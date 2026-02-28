"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useDataset } from "@/hooks/useDataset";
import { useLabels } from "@/hooks/useLabels";
import { useRewardRule } from "@/hooks/useRewardRule";
import { useSignalData } from "@/hooks/useSignalData";

import { EpisodeList } from "@/components/sidebar/EpisodeList";
import { DatasetSelector } from "@/components/sidebar/DatasetSelector";
import { LabelPanel } from "@/components/labels/LabelPanel";
import { RewardStrip } from "@/components/labels/RewardStrip";
import { VideoPlayer } from "@/components/viewer/VideoPlayer";
import { SignalChart, type ZoomDomain } from "@/components/viewer/SignalChart";
import { SignalSelector } from "@/components/viewer/SignalSelector";
import { PanelGrid, type PanelItem } from "@/components/viewer/PanelGrid";
import { SortablePanel } from "@/components/viewer/SortablePanel";
import { Timeline } from "@/components/timeline/Timeline";
import { PlaybackControls } from "@/components/timeline/PlaybackControls";
import { ConfirmModal } from "@/components/ui/ConfirmModal";

import type { VideoMeta } from "@/lib/types";
import { flattenFeatureNames } from "@/lib/types";
import * as api from "@/lib/api";

export default function LabelerPage() {
  const dataset = useDataset();

  // True if we navigated here from the home page with a stored dataset path.
  // Checked synchronously so the very first render shows a loading screen
  // instead of briefly flashing the dataset selector.
  const [resuming] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!sessionStorage.getItem("dataset_path");
  });

  // Load-new-dataset modal
  const [showLoadModal, setShowLoadModal] = useState(false);

  // Trash panel
  const [trashOpen, setTrashOpen] = useState(false);

  // Export confirmation
  const [showExportConfirm, setShowExportConfirm] = useState(false);

  // Measure episode list container height for react-window
  const [episodeListHeight, setEpisodeListHeight] = useState(500);
  const observerRef = useRef<ResizeObserver | null>(null);
  const episodeListRef = useCallback((node: HTMLDivElement | null) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      const ro = new ResizeObserver(([entry]) => {
        setEpisodeListHeight(entry.contentRect.height);
      });
      ro.observe(node);
      observerRef.current = ro;
    }
  }, []);

  // Playback state
  const [frameIndex, setFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);

  // Video metadata (per-camera from_timestamp for seeking within the MP4)
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);

  // Signal plot state
  const [selectedSignals, setSelectedSignals] = useState<string[]>([]);

  // Synced zoom domain across all signal charts
  const [zoomDomain, setZoomDomain] = useState<ZoomDomain | null>(null);

  // Panel ordering: videos + signals in a single draggable grid
  const [panels, setPanels] = useState<PanelItem[]>([]);

  const { setLabel, removeLabel, bulkSetLabel, bulkRemoveLabels, saving, error: labelError } = useLabels({
    onLabelChanged: dataset.updateEpisodeLabel,
    onBulkLabelChanged: dataset.bulkUpdateEpisodeLabels,
  });

  const { rule: rewardRule, presets: rewardPresets, updateRule: updateRewardRule, saving: rewardRuleSaving } = useRewardRule();

  const { data: signalData, availableKeys } = useSignalData({
    episodeIndex: dataset.selectedEpisode,
    selectedKeys: selectedSignals,
  });

  // Resume from an already-loaded backend session (no double-load)
  useEffect(() => {
    if (!dataset.info && resuming) {
      dataset.resumeSession();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close the load-dataset modal when a dataset successfully loads
  useEffect(() => {
    if (dataset.info && showLoadModal) {
      setShowLoadModal(false);
    }
  }, [dataset.info, showLoadModal]);

  // Fetch video metadata when episode changes
  useEffect(() => {
    if (dataset.selectedEpisode === null) {
      setVideoMeta(null);
      return;
    }
    api.getVideoMeta(dataset.selectedEpisode).then(setVideoMeta).catch(() => {});
  }, [dataset.selectedEpisode]);

  // Keep panel list in sync with cameras + selected signals.
  useEffect(() => {
    const videoKeys = dataset.info?.video_keys ?? [];
    setPanels((prev) => {
      const validIds = new Set([
        ...videoKeys.map((k) => `video:${k}`),
        ...selectedSignals.map((k) => `signal:${k}`),
      ]);
      const kept = prev.filter((p) => validIds.has(p.id));
      const existingIds = new Set(kept.map((p) => p.id));

      const newPanels: PanelItem[] = [];
      for (const key of videoKeys) {
        const id = `video:${key}`;
        if (!existingIds.has(id)) newPanels.push({ id, type: "video", key });
      }
      for (const key of selectedSignals) {
        const id = `signal:${key}`;
        if (!existingIds.has(id)) newPanels.push({ id, type: "signal", key });
      }
      if (newPanels.length === 0 && kept.length === prev.length) return prev;
      return [...kept, ...newPanels];
    });
  }, [dataset.info?.video_keys, selectedSignals]);

  // Reset when episode changes
  useEffect(() => {
    setFrameIndex(0);
    setIsPlaying(false);
  }, [dataset.selectedEpisode]);

  // Playback control: just toggle state; <video> elements handle the rest
  const handlePlayPause = useCallback(() => {
    if (!dataset.info || dataset.selectedEpisode === null) return;
    setIsPlaying((prev) => !prev);
  }, [dataset.info, dataset.selectedEpisode]);

  // Seek: the <video> elements react to frameIndex changes
  const handleSeek = useCallback((frame: number) => {
    setFrameIndex(frame);
  }, []);

  // Primary camera time update drives the timeline during playback
  const handleVideoTimeUpdate = useCallback((frame: number) => {
    setFrameIndex(frame);
  }, []);

  // Stop playback when the episode ends
  const handlePlaybackEnd = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const handleStepBack = useCallback(() => {
    setIsPlaying(false);
    setFrameIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleStepForward = useCallback(() => {
    const ep = dataset.episodes.find(
      (e) => e.episode_index === dataset.selectedEpisode
    );
    const max = ep ? ep.length - 1 : 0;
    setIsPlaying(false);
    setFrameIndex((prev) => Math.min(max, prev + 1));
  }, [dataset.episodes, dataset.selectedEpisode]);

  // Navigate by array position (not index arithmetic) to skip soft-deleted gaps
  const handlePrevEpisode = useCallback(() => {
    if (dataset.selectedEpisode === null) return;
    const currentPos = dataset.episodes.findIndex(
      (e) => e.episode_index === dataset.selectedEpisode
    );
    if (currentPos > 0) {
      dataset.selectEpisode(dataset.episodes[currentPos - 1].episode_index);
    }
  }, [dataset]);

  const handleNextEpisode = useCallback(() => {
    if (dataset.selectedEpisode === null) return;
    const currentPos = dataset.episodes.findIndex(
      (e) => e.episode_index === dataset.selectedEpisode
    );
    if (currentPos >= 0 && currentPos < dataset.episodes.length - 1) {
      dataset.selectEpisode(dataset.episodes[currentPos + 1].episode_index);
    }
  }, [dataset]);

  const deletedCount = dataset.deletedEpisodes.length;

  const handleExport = useCallback(() => {
    if (deletedCount === 0) return;
    setShowExportConfirm(true);
  }, [deletedCount]);

  const handleBulkLabel = useCallback(
    (label: "success" | "failure") => {
      const indices = dataset.episodes.map((ep) => ep.episode_index);
      if (indices.length === 0) return;
      bulkSetLabel(indices, label);
    },
    [dataset.episodes, bulkSetLabel]
  );

  const handleBulkClear = useCallback(() => {
    const indices = dataset.episodes.map((ep) => ep.episode_index);
    if (indices.length === 0) return;
    bulkRemoveLabels(indices);
  }, [dataset.episodes, bulkRemoveLabels]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;

      switch (e.key) {
        case " ":
          e.preventDefault();
          handlePlayPause();
          break;
        case "ArrowLeft":
          e.preventDefault();
          handleStepBack();
          break;
        case "ArrowRight":
          e.preventDefault();
          handleStepForward();
          break;
        case "s":
        case "S":
          if (dataset.selectedEpisode !== null) {
            setLabel(dataset.selectedEpisode, "success");
            handleNextEpisode();
          }
          break;
        case "f":
        case "F":
          if (dataset.selectedEpisode !== null) {
            setLabel(dataset.selectedEpisode, "failure");
            handleNextEpisode();
          }
          break;
        case "[":
        case "ArrowUp":
          e.preventDefault();
          handlePrevEpisode();
          break;
        case "]":
        case "ArrowDown":
          e.preventDefault();
          handleNextEpisode();
          break;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    handlePlayPause,
    handleStepBack,
    handleStepForward,
    handlePrevEpisode,
    handleNextEpisode,
    dataset.selectedEpisode,
    setLabel,
  ]);

  const currentEp = dataset.episodes.find(
    (e) => e.episode_index === dataset.selectedEpisode
  );
  const totalFrames = currentEp?.length || 0;

  // Identify the first camera for driving the timeline
  const primaryCamera = dataset.info?.video_keys?.[0] ?? null;

  // If no dataset loaded yet
  if (!dataset.info) {
    // Resuming from home page, so show loading screen (no selector flash)
    if (resuming || dataset.loading) {
      return (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <svg className="w-8 h-8 text-[#D3D5FD] animate-spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="10" cy="10" r="7" strokeOpacity="0.25" />
              <path d="M10 3a7 7 0 0 1 7 7" strokeLinecap="round" />
            </svg>
            <div className="text-sm text-[#929AAB]">Loading dataset...</div>
          </div>
        </div>
      );
    }

    // No stored session, so show the selector for a fresh load
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="text-center mb-6">
            <h2 className="text-lg font-semibold text-[#D3D5FD] mb-1">
              Load a Dataset
            </h2>
            <p className="text-xs text-[#929AAB]">
              Select a local LeRobot v3.0 dataset directory
            </p>
          </div>
          <div className="bg-[#0B0B0D]/90 backdrop-blur-xl border border-[#2a2d38] rounded-2xl p-6">
            <DatasetSelector
              onLoad={dataset.loadDataset}
              loading={dataset.loading}
              error={dataset.error}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Sidebar */}
      <aside className="w-64 bg-[#0B0B0D] border-r border-[#1e2028] flex flex-col">
        <div className="p-3 border-b border-[#1e2028]">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-medium text-[#D3D5FD] truncate">
              {dataset.info.repo_id}
            </div>
            <button
              onClick={() => setShowLoadModal(true)}
              className="shrink-0 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] text-[#D3D5FD]/60 hover:text-[#D3D5FD] hover:bg-[#161821] transition-colors border border-[#2a2d38]"
            >
              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h5l2 2h5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                <path d="M10 9v5M7.5 11.5h5" />
              </svg>
              Load
            </button>
          </div>
          <div className="text-xs text-[#929AAB] mt-0.5">
            {dataset.episodes.length} episodes &middot;{" "}
            {dataset.info.fps} fps
          </div>
        </div>

        <div ref={episodeListRef} className="flex-1 overflow-hidden">
          <EpisodeList
            episodes={dataset.episodes}
            selectedEpisode={dataset.selectedEpisode}
            onSelectEpisode={dataset.selectEpisode}
            onDeleteEpisode={dataset.deleteEpisode}
            height={episodeListHeight}
            fps={dataset.info.fps}
          />
        </div>

        {/* Trash panel */}
        {deletedCount > 0 && (
          <div className="border-t border-[#1e2028]">
            <button
              onClick={() => setTrashOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs text-[#929AAB] hover:text-[#D3D5FD] hover:bg-[#161821] transition-colors"
            >
              <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 4h12M5.5 4V2.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V4M6.5 7v5M9.5 7v5M3.5 4l.5 9a1.5 1.5 0 0 0 1.5 1.5h5A1.5 1.5 0 0 0 12 13l.5-9" />
              </svg>
              <span>Trash ({deletedCount})</span>
              <svg
                className={`w-3 h-3 ml-auto transition-transform ${trashOpen ? "rotate-180" : ""}`}
                viewBox="0 0 10 6"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
              >
                <path d="M1 1l4 4 4-4" />
              </svg>
            </button>
            {trashOpen && (
              <div className="max-h-40 overflow-y-auto">
                {dataset.deletedEpisodes.map((idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between px-3 py-1.5 text-xs text-[#929AAB] hover:bg-[#161821] transition-colors"
                  >
                    <span className="font-mono">#{idx + 1}</span>
                    <button
                      onClick={() => dataset.restoreEpisode(idx)}
                      className="flex items-center gap-1 text-[10px] text-[#474A56] hover:text-[#D3D5FD] transition-colors"
                      title="Restore episode"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M2 8a6 6 0 0 1 6-6 6 6 0 0 1 6 6 6 6 0 0 1-6 6" />
                        <path d="M2 4v4h4" />
                      </svg>
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Export section */}
        <div className="p-3 border-t border-[#1e2028]">
          <button
            onClick={handleExport}
            disabled={deletedCount === 0 || dataset.exporting}
            className="w-full flex items-center justify-center gap-2 bg-[#161821] hover:bg-[#1e2028] disabled:bg-[#0B0B0D] disabled:text-[#2a2d38] text-[#D3D5FD] hover:text-[#D3D5FD] px-3 py-2 rounded-lg text-xs font-medium transition-all border border-[#2a2d38] disabled:border-[#1e2028]"
          >
            {dataset.exporting ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="10" cy="10" r="7" strokeOpacity="0.25" />
                  <path d="M10 3a7 7 0 0 1 7 7" strokeLinecap="round" />
                </svg>
                Exporting...
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M13.75 7h-3V3.66l1.95 2.1a.75.75 0 1 0 1.1-1.02l-3.25-3.5a.75.75 0 0 0-1.1 0L6.2 4.74a.75.75 0 0 0 1.1 1.02l1.95-2.1V7h-3A2.25 2.25 0 0 0 4 9.25v7.5A2.25 2.25 0 0 0 6.25 19h7.5A2.25 2.25 0 0 0 16 16.75v-7.5A2.25 2.25 0 0 0 13.75 7z" />
                </svg>
                Export Dataset
              </>
            )}
          </button>
        </div>

        <div className="p-3 border-t border-[#1e2028] text-[10px] text-[#474A56]">
          <div>S / F = label success / failure</div>
          <div>Space = play/pause, Arrows = step</div>
          <div>[ / ] = prev/next episode</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-auto p-4">
          <PanelGrid panels={panels} onReorder={setPanels}>
            {panels.map((panel) => {
              if (panel.type === "video") {
                const shortName = panel.key.split(".").pop() || panel.key;
                const camMeta = videoMeta?.[panel.key];
                return (
                  <SortablePanel
                    key={panel.id}
                    id={panel.id}
                    title={shortName}
                  >
                    {dataset.selectedEpisode !== null && camMeta ? (
                      <VideoPlayer
                        episodeIndex={dataset.selectedEpisode}
                        cameraKey={panel.key}
                        frameIndex={frameIndex}
                        totalFrames={totalFrames}
                        fps={dataset.info?.fps ?? 30}
                        fromTimestamp={camMeta.from_timestamp}
                        isPlaying={isPlaying}
                        speed={speed}
                        onTimeUpdate={
                          panel.key === primaryCamera
                            ? handleVideoTimeUpdate
                            : undefined
                        }
                        onPlaybackEnd={
                          panel.key === primaryCamera
                            ? handlePlaybackEnd
                            : undefined
                        }
                      />
                    ) : (
                      <div
                        className="w-full bg-[#0B0B0D]"
                        style={{ aspectRatio: "16/9" }}
                      />
                    )}
                  </SortablePanel>
                );
              }
              // signal panel
              return (
                <SortablePanel
                  key={panel.id}
                  id={panel.id}
                  title={panel.key}
                  fullWidth
                  onRemove={() =>
                    setSelectedSignals((prev) =>
                      prev.filter((k) => k !== panel.key)
                    )
                  }
                >
                  <SignalChart
                    signalKey={panel.key}
                    timestamps={signalData?.timestamps || []}
                    values={signalData?.signals[panel.key] || []}
                    currentFrameIndex={frameIndex}
                    dimensionNames={flattenFeatureNames(
                      dataset.info?.features[panel.key]?.names ?? null
                    )}
                    defaultHeight={250}
                    zoomDomain={zoomDomain}
                    onZoomChange={setZoomDomain}
                  />
                </SortablePanel>
              );
            })}
          </PanelGrid>

          {/* Signal selector below the panel grid */}
          <div className="mt-3">
            <SignalSelector
              availableKeys={availableKeys}
              selectedKeys={selectedSignals}
              onAdd={(key) =>
                setSelectedSignals((prev) => [...prev, key])
              }
            />
          </div>
        </div>

        {/* Reward labeling toolbar + timeline + playback controls */}
        <div className="border-t border-[#1e2028] bg-[#0B0B0D] px-4 py-3 flex flex-col gap-2">
          <LabelPanel
            episodeIndex={dataset.selectedEpisode}
            currentLabel={currentEp?.label || null}
            totalEpisodes={dataset.episodes.length}
            labeledCount={dataset.episodes.filter((ep) => ep.label !== null).length}
            onSetLabel={(label) => {
              if (dataset.selectedEpisode !== null) {
                setLabel(dataset.selectedEpisode, label);
                handleNextEpisode();
              }
            }}
            onRemoveLabel={() => {
              if (dataset.selectedEpisode !== null) {
                removeLabel(dataset.selectedEpisode);
              }
            }}
            onBulkLabel={handleBulkLabel}
            onBulkClear={handleBulkClear}
            saving={saving}
            error={labelError}
            rewardRule={rewardRule}
            rewardPresets={rewardPresets}
            onRewardRuleChange={(rule, reapply) => updateRewardRule(rule, reapply)}
            rewardRuleSaving={rewardRuleSaving}
          />
          <RewardStrip
            label={currentEp?.label || null}
            totalFrames={totalFrames}
            currentFrame={frameIndex}
            rewardRule={rewardRule}
            fps={dataset.info.fps}
          />
          <Timeline
            currentFrame={frameIndex}
            totalFrames={totalFrames}
            onSeek={handleSeek}
            fps={dataset.info.fps}
          />
          <PlaybackControls
            isPlaying={isPlaying}
            speed={speed}
            onPlayPause={handlePlayPause}
            onStepBack={handleStepBack}
            onStepForward={handleStepForward}
            onSpeedChange={setSpeed}
            onPrevEpisode={handlePrevEpisode}
            onNextEpisode={handleNextEpisode}
          />
        </div>
      </main>

      {/* Load new dataset modal */}
      {showLoadModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowLoadModal(false);
          }}
        >
          <div className="max-w-lg w-full mx-6">
            <div className="bg-[#0B0B0D]/90 backdrop-blur-xl border border-[#2a2d38] rounded-2xl p-8 shadow-2xl shadow-black/40">
              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="text-sm font-medium text-[#D3D5FD] mb-1">
                    Dataset Path
                  </h2>
                  <p className="text-xs text-[#929AAB]">
                    Select a local directory containing a LeRobot v3.0 dataset
                  </p>
                </div>
                <button
                  onClick={() => setShowLoadModal(false)}
                  className="shrink-0 p-1 rounded-md text-[#929AAB] hover:text-[#D3D5FD] hover:bg-[#161821] transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                    <path d="M5 5l10 10M15 5L5 15" />
                  </svg>
                </button>
              </div>
              <DatasetSelector
                onLoad={(path, saveTo) => {
                  dataset.loadDataset(path, saveTo);
                }}
                loading={dataset.loading}
                error={dataset.error}
              />
            </div>
          </div>
        </div>
      )}

      {/* Export confirmation modal */}
      {showExportConfirm && (
        <ConfirmModal
          title={`Apply ${deletedCount} pending deletion${deletedCount === 1 ? "" : "s"}?`}
          message="This will re-encode video files and cannot be undone."
          confirmLabel="Export"
          onConfirm={() => {
            setShowExportConfirm(false);
            dataset.exportDataset();
          }}
          onCancel={() => setShowExportConfirm(false)}
        />
      )}
    </>
  );
}
