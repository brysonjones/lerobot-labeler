import type { DatasetInfo, EpisodeSummary, LabelSummary, RewardRule, SignalData, VideoMeta } from "./types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8976";

async function fetchJSON<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API error ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export async function getDatasetInfo(): Promise<DatasetInfo> {
  return fetchJSON("/api/datasets/info");
}

export async function loadDataset(path: string, saveTo?: string): Promise<DatasetInfo> {
  let url = `/api/datasets/load?path=${encodeURIComponent(path)}`;
  if (saveTo) {
    url += `&save_to=${encodeURIComponent(saveTo)}`;
  }
  return fetchJSON(url);
}

export async function getEpisodes(): Promise<EpisodeSummary[]> {
  return fetchJSON("/api/datasets/episodes");
}

export async function getEpisode(epIndex: number): Promise<EpisodeSummary> {
  return fetchJSON(`/api/datasets/episodes/${epIndex}`);
}

export async function getEpisodeSignals(
  epIndex: number,
  keys: string[]
): Promise<SignalData> {
  const params = keys.map((k) => `keys=${encodeURIComponent(k)}`).join("&");
  return fetchJSON(`/api/datasets/episodes/${epIndex}/signals?${params}`);
}

export async function getAvailableSignals(): Promise<{ keys: string[] }> {
  return fetchJSON("/api/datasets/signals/available");
}

export async function getLabel(
  epIndex: number
): Promise<{ episode_index: number; label: string | null }> {
  return fetchJSON(`/api/labels/${epIndex}`);
}

export async function setLabel(
  epIndex: number,
  label: "success" | "failure"
): Promise<{ episode_index: number; label: string; saved: boolean }> {
  return fetchJSON(`/api/labels/${epIndex}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label }),
  });
}

export async function removeLabel(
  epIndex: number
): Promise<{ episode_index: number; label: null; saved: boolean }> {
  return fetchJSON(`/api/labels/${epIndex}`, { method: "DELETE" });
}

export async function bulkSetLabel(
  episodeIndices: number[],
  label: "success" | "failure"
): Promise<{ labeled: number; label: string }> {
  return fetchJSON("/api/labels/bulk", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label, episode_indices: episodeIndices }),
  });
}

export async function bulkRemoveLabels(): Promise<{ cleared: number }> {
  return fetchJSON("/api/labels/bulk", { method: "DELETE" });
}

export async function getLabelSummary(): Promise<LabelSummary> {
  return fetchJSON("/api/labels/summary");
}

export async function softDeleteEpisode(
  episodeIndex: number
): Promise<{ deleted_episodes: number[] }> {
  return fetchJSON("/api/datasets/episodes/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ episode_indices: [episodeIndex] }),
  });
}

export async function restoreEpisode(
  episodeIndex: number
): Promise<{ deleted_episodes: number[] }> {
  return fetchJSON("/api/datasets/episodes/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ episode_indices: [episodeIndex] }),
  });
}

export async function exportDataset(): Promise<{
  deleted: number;
  remaining: number;
  info: DatasetInfo;
}> {
  return fetchJSON("/api/datasets/export", { method: "POST" });
}

export async function getSession(): Promise<{ deleted_episodes: number[] }> {
  return fetchJSON("/api/datasets/session");
}

export async function getRewardRule(): Promise<RewardRule> {
  return fetchJSON("/api/labels/reward-rule");
}

export async function setRewardRule(
  rule: RewardRule,
  reapply: boolean = true
): Promise<{ reward_rule: RewardRule; reapplied: number }> {
  return fetchJSON("/api/labels/reward-rule", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reward_rule: rule, reapply }),
  });
}

export async function getRewardPresets(): Promise<Record<string, RewardRule>> {
  return fetchJSON("/api/labels/reward-presets");
}

export async function getVideoMeta(epIndex: number): Promise<VideoMeta> {
  return fetchJSON(`/api/datasets/episodes/${epIndex}/video-meta`);
}

export function getVideoUrl(epIndex: number, cameraKey: string): string {
  return `${BASE_URL}/api/datasets/episodes/${epIndex}/video/${encodeURIComponent(cameraKey)}`;
}
