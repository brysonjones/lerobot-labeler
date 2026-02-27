import logging
import shutil
from pathlib import Path

import numpy as np
import pyarrow.parquet as pq

from lerobot.datasets.dataset_tools import delete_episodes as lerobot_delete_episodes
from lerobot.datasets.lerobot_dataset import LeRobotDataset, LeRobotDatasetMetadata

logger = logging.getLogger(__name__)


class DatasetService:
    """Manages loading and querying a local LeRobot dataset for labeling."""

    def __init__(self) -> None:
        self.meta: LeRobotDatasetMetadata | None = None
        self.root: Path | None = None
        self._timestamp_cache: dict[int, list[float]] = {}

    def load(self, dataset_path: str, save_to: str | None = None) -> dict:
        """Load a dataset from a local directory path.

        If *save_to* is provided it is treated as a path relative to the
        dataset's parent directory.  The dataset is copied there first
        (video files are symlinked to save space) and all subsequent
        operations — including label writes — target the copy.
        """
        source = Path(dataset_path)
        if not (source / "meta" / "info.json").exists():
            raise FileNotFoundError(f"No LeRobot dataset found at {dataset_path}")

        if save_to:
            dest = (source.parent / save_to).resolve()
            self._copy_dataset(source, dest)
            self.root = dest
        else:
            self.root = source

        repo_id = self.root.name
        self.meta = LeRobotDatasetMetadata(repo_id=repo_id, root=self.root)
        self._timestamp_cache.clear()
        return self._build_info_dict()

    def delete_episodes(self, episode_indices: list[int]) -> dict:
        """Delete episodes using lerobot's delete_episodes tool.

        Creates a new dataset without the specified episodes, then swaps
        it in place of the current one.
        """
        self._ensure_loaded()

        repo_id = self.root.name
        tmp_dir = self.root.parent / f".{repo_id}_deleting"

        # Clean up any stale temp dir from a previous failed attempt
        if tmp_dir.exists():
            shutil.rmtree(tmp_dir)

        try:
            # Load full dataset object (required by lerobot's delete_episodes)
            dataset = LeRobotDataset(repo_id=repo_id, root=self.root)

            # Create new dataset without the deleted episodes
            lerobot_delete_episodes(
                dataset,
                episode_indices,
                output_dir=tmp_dir,
                repo_id=repo_id,
            )

            # Swap: rename current → backup, new → current, remove backup
            backup = self.root.parent / f".{repo_id}_backup"
            if backup.exists():
                shutil.rmtree(backup)

            self.root.rename(backup)
            try:
                tmp_dir.rename(self.root)
                shutil.rmtree(backup)
            except Exception:
                # Restore from backup on failure
                if backup.exists() and not self.root.exists():
                    backup.rename(self.root)
                raise

            # Reload metadata from the updated dataset
            self.meta = LeRobotDatasetMetadata(repo_id=repo_id, root=self.root)
            self._timestamp_cache.clear()

            logger.info(
                "Deleted %d episodes, %d remaining",
                len(episode_indices),
                self.meta.total_episodes,
            )
            return {
                "deleted": len(episode_indices),
                "remaining": self.meta.total_episodes,
            }
        except Exception:
            # Clean up temp dir on any failure
            if tmp_dir.exists():
                shutil.rmtree(tmp_dir)
            raise

    def get_episode_list(self, exclude: set[int] | None = None) -> list[dict]:
        """Return a summary for each episode, optionally excluding some."""
        self._ensure_loaded()
        episodes = []
        for i in range(self.meta.total_episodes):
            if exclude and i in exclude:
                continue
            ep = self.meta.episodes[i]
            task_indices = ep.get("tasks", [])
            task_names = []
            if self.meta.tasks is not None and len(task_indices) > 0:
                for tid in (task_indices if isinstance(task_indices, list) else [task_indices]):
                    matches = self.meta.tasks[self.meta.tasks["task_index"] == tid]
                    if len(matches) > 0:
                        task_names.append(matches.index[0])
            episodes.append({
                "episode_index": i,
                "length": ep["length"],
                "tasks": task_names,
            })
        return episodes

    def get_episode_timestamps(self, ep_index: int) -> list[float]:
        """Get all timestamps for an episode's frames. Cached per episode."""
        if ep_index in self._timestamp_cache:
            return self._timestamp_cache[ep_index]

        self._ensure_loaded()
        data_path = self.root / self.meta.get_data_file_path(ep_index)
        table = pq.read_table(data_path, columns=["episode_index", "timestamp"])
        df = table.to_pandas()
        ep_df = df[df["episode_index"] == ep_index]
        timestamps = ep_df["timestamp"].tolist()
        self._timestamp_cache[ep_index] = timestamps
        return timestamps

    def get_episode_signals(self, ep_index: int, keys: list[str]) -> dict:
        """Load signal data from parquet for a specific episode."""
        self._ensure_loaded()
        requested_cols = ["episode_index", "timestamp"] + keys
        data_path = self.root / self.meta.get_data_file_path(ep_index)

        available_cols = pq.read_schema(data_path).names
        cols_to_read = [c for c in requested_cols if c in available_cols]

        table = pq.read_table(data_path, columns=cols_to_read)
        df = table.to_pandas()
        ep_df = df[df["episode_index"] == ep_index].reset_index(drop=True)

        result: dict = {"timestamps": ep_df["timestamp"].tolist(), "signals": {}}
        for key in keys:
            if key in ep_df.columns:
                values = ep_df[key].tolist()
                processed = []
                for val in values:
                    if isinstance(val, np.ndarray):
                        processed.append(val.tolist())
                    elif isinstance(val, (list, tuple)):
                        processed.append(list(val))
                    else:
                        processed.append([float(val)])
                result["signals"][key] = processed
        return result

    def get_signal_keys(self) -> list[str]:
        """Return feature keys suitable for signal plotting (non-video, non-image)."""
        self._ensure_loaded()
        return [
            key
            for key, ft in self.meta.features.items()
            if ft["dtype"] not in ("video", "image")
            and key not in ("episode_index", "frame_index", "timestamp", "index", "task_index")
        ]

    def _build_info_dict(self) -> dict:
        return {
            "repo_id": self.root.name,
            "root_path": str(self.root),
            "fps": self.meta.fps,
            "total_episodes": self.meta.total_episodes,
            "total_frames": self.meta.total_frames,
            "features": {k: dict(v) for k, v in self.meta.features.items()},
            "video_keys": self.meta.video_keys,
            "camera_keys": self.meta.camera_keys,
            "robot_type": self.meta.robot_type,
        }

    def _copy_dataset(self, source: Path, dest: Path) -> None:
        """Copy a dataset to *dest*, symlinking video files to save space."""
        if dest.exists():
            raise FileExistsError(f"Destination already exists: {dest}")

        for item in sorted(source.rglob("*")):
            rel = item.relative_to(source)
            target = dest / rel

            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            elif item.suffix == ".mp4":
                # Symlink video files — they are large and read-only
                target.parent.mkdir(parents=True, exist_ok=True)
                target.symlink_to(item.resolve())
            else:
                # Copy metadata, parquet, and other files
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(item, target)

    def _ensure_loaded(self) -> None:
        if self.meta is None:
            raise RuntimeError("No dataset loaded. Call load() first.")
