import json
from pathlib import Path

import pyarrow as pa
import pyarrow.parquet as pq
from filelock import FileLock

from backend.models.schemas import RewardRule
from backend.services.dataset_service import DatasetService
from backend.services.session_service import SessionService


class LabelService:
    """Manages reward/is_done labeling and persists to parquet files."""

    def __init__(self, dataset_service: DatasetService, session_service: SessionService) -> None:
        self._ds = dataset_service
        self._session = session_service
        self._labels: dict[int, str] = {}
        self._initialized = False

    def load_all_labels(self) -> None:
        """Build in-memory label cache.

        Prefers session-stored labels; falls back to parquet inference
        for legacy datasets that predate session-based label storage.
        """
        session_labels = self._session.get_labels()
        if session_labels:
            self._labels = dict(session_labels)
        else:
            # Legacy fallback: infer from parquet
            self._labels.clear()
            for ep_idx in range(self._ds.meta.total_episodes):
                label = self._read_label_from_parquet(ep_idx)
                if label is not None:
                    self._labels[ep_idx] = label
            # Migrate discovered labels into session for future loads
            for ep_idx, label in self._labels.items():
                self._session.set_label_record(ep_idx, label)
        self._initialized = True

    def get_label(self, ep_index: int) -> str | None:
        if not self._initialized:
            self.load_all_labels()
        return self._labels.get(ep_index)

    def set_label(self, ep_index: int, label: str) -> None:
        """Set success/failure label for an episode and persist to parquet."""
        if label not in ("success", "failure"):
            raise ValueError(f"Label must be 'success' or 'failure', got '{label}'")

        self._ensure_features_exist()
        self._write_label_to_parquet(ep_index, label)
        self._labels[ep_index] = label
        self._session.set_label_record(ep_index, label)

    def remove_label(self, ep_index: int) -> None:
        """Remove reward label from an episode."""
        self._ensure_features_exist()
        self._write_label_to_parquet(ep_index, None)
        self._labels.pop(ep_index, None)
        self._session.set_label_record(ep_index, None)

    def reapply_all(self, reward_rule: RewardRule) -> int:
        """Re-write all labeled episodes with a given reward rule.

        Returns the number of episodes updated.
        """
        if not self._initialized:
            self.load_all_labels()
        self._ensure_features_exist()
        count = 0
        for ep_idx, label in self._labels.items():
            self._write_label_to_parquet(ep_idx, label, reward_rule=reward_rule)
            count += 1
        return count

    def get_summary(self) -> dict:
        if not self._initialized:
            self.load_all_labels()
        total = self._ds.meta.total_episodes
        success = sum(1 for v in self._labels.values() if v == "success")
        failure = sum(1 for v in self._labels.values() if v == "failure")
        labeled = success + failure
        return {
            "total": total,
            "labeled": labeled,
            "success": success,
            "failure": failure,
            "unlabeled": total - labeled,
        }

    def _ensure_features_exist(self) -> None:
        """Add reward and is_done features to info.json if missing."""
        info_path = self._ds.root / "meta" / "info.json"
        with open(info_path) as f:
            info = json.load(f)

        features = info["features"]
        changed = False

        if "reward" not in features:
            features["reward"] = {"dtype": "float32", "shape": [1], "names": None}
            changed = True
        if "is_done" not in features:
            features["is_done"] = {"dtype": "bool", "shape": [1], "names": None}
            changed = True

        if changed:
            with open(info_path, "w") as f:
                json.dump(info, f, indent=2)
            # Reload metadata to reflect changes
            self._ds.meta.info = info

    def _write_label_to_parquet(
        self, ep_index: int, label: str | None, reward_rule: RewardRule | None = None
    ) -> None:
        """Read-modify-write the parquet file to update reward/is_done columns."""
        if reward_rule is None:
            reward_rule = self._session.get_reward_rule()

        data_path = self._ds.root / self._ds.meta.get_data_file_path(ep_index)
        lock_path = str(data_path) + ".lock"

        with FileLock(lock_path):
            table = pq.read_table(data_path)
            df = table.to_pandas()

            # Add columns if they don't exist
            if "reward" not in df.columns:
                df["reward"] = 0.0
            if "is_done" not in df.columns:
                df["is_done"] = False

            ep_mask = df["episode_index"] == ep_index

            # Reset this episode's values
            df.loc[ep_mask, "reward"] = 0.0
            df.loc[ep_mask, "is_done"] = False

            if label is not None:
                ep_indices = df.index[ep_mask]
                last_frame_idx = ep_indices[-1]
                non_terminal = ep_indices[:-1]

                # Step reward on all non-terminal frames
                if len(non_terminal) > 0:
                    df.loc[non_terminal, "reward"] = float(reward_rule.step_reward)

                # Terminal reward based on label
                terminal_reward = (
                    reward_rule.success_terminal_reward
                    if label == "success"
                    else reward_rule.failure_terminal_reward
                )
                df.at[last_frame_idx, "reward"] = float(terminal_reward)
                df.at[last_frame_idx, "is_done"] = True

            new_table = pa.Table.from_pandas(df, preserve_index=False)
            pq.write_table(new_table, data_path, compression="snappy")

    def _read_label_from_parquet(self, ep_index: int) -> str | None:
        """Read label status from parquet data for a single episode.

        Legacy fallback — used only for datasets without session-stored labels.
        """
        data_path = self._ds.root / self._ds.meta.get_data_file_path(ep_index)
        try:
            table = pq.read_table(
                data_path, columns=["episode_index", "reward", "is_done"]
            )
        except Exception:
            return None

        df = table.to_pandas()
        ep_df = df[df["episode_index"] == ep_index]
        if ep_df.empty:
            return None

        last_row = ep_df.iloc[-1]
        if last_row.get("is_done", False):
            return "success" if last_row.get("reward", 0.0) > 0.5 else "failure"
        return None
