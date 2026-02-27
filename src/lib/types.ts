export interface DatasetInfo {
  repo_id: string;
  root_path: string;
  fps: number;
  total_episodes: number;
  total_frames: number;
  features: Record<string, FeatureInfo>;
  video_keys: string[];
  camera_keys: string[];
  robot_type: string | null;
}

export interface FeatureInfo {
  dtype: string;
  shape: number[];
  names: string[] | Record<string, string[]> | null;
}

/** Flatten feature names from either flat list or nested dict to a simple string array. */
export function flattenFeatureNames(names: FeatureInfo["names"]): string[] | null {
  if (!names) return null;
  if (Array.isArray(names)) return names;
  return Object.values(names).flat();
}

export interface EpisodeSummary {
  episode_index: number;
  length: number;
  tasks: string[];
  label: string | null;
}

export interface SignalData {
  timestamps: number[];
  signals: Record<string, number[][]>;
}

export interface LabelSummary {
  total: number;
  labeled: number;
  success: number;
  failure: number;
  unlabeled: number;
}

export interface FrameMessage {
  cameraKey: string;
  frameIndex: number;
  jpegData: ArrayBuffer;
}

export interface RewardRule {
  step_reward: number;
  success_terminal_reward: number;
  failure_terminal_reward: number;
}

/** Per-camera timing offsets within the video file. */
export interface VideoMeta {
  [cameraKey: string]: {
    from_timestamp: number;
    to_timestamp: number;
  };
}
