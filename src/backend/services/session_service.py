import json
import logging
from pathlib import Path

from backend.models.schemas import RewardRule
from backend.services.dataset_service import DatasetService

logger = logging.getLogger(__name__)

SESSION_FILENAME = ".labeler-session.json"


class SessionService:
    """Tracks soft-deleted episodes, reward rule, and label records
    in a JSON file alongside the dataset.

    Deletions are deferred: no video re-encoding happens until export().
    """

    def __init__(self, dataset_service: DatasetService) -> None:
        self._ds = dataset_service
        self._deleted: set[int] = set()
        self._reward_rule: RewardRule = RewardRule()
        self._labels: dict[int, str] = {}
        self._session_path: Path | None = None

    def load(self) -> None:
        """Load or create session file from the current dataset root."""
        if self._ds.root is None:
            self._deleted.clear()
            self._reward_rule = RewardRule()
            self._labels.clear()
            self._session_path = None
            return

        self._session_path = self._ds.root / SESSION_FILENAME
        if self._session_path.exists():
            with open(self._session_path) as f:
                data = json.load(f)
            self._deleted = set(data.get("deleted_episodes", []))
            rule_data = data.get("reward_rule")
            self._reward_rule = RewardRule(**rule_data) if rule_data else RewardRule()
            labels_data = data.get("labels", {})
            self._labels = {int(k): v for k, v in labels_data.items()}
            logger.info(
                "Loaded session with %d soft-deleted episodes, %d labels",
                len(self._deleted),
                len(self._labels),
            )
        else:
            self._deleted.clear()
            self._reward_rule = RewardRule()
            self._labels.clear()

    def soft_delete(self, ep_index: int) -> None:
        """Mark an episode as soft-deleted."""
        if ep_index < 0 or ep_index >= self._ds.meta.total_episodes:
            raise ValueError(f"Episode index {ep_index} out of range")
        if ep_index in self._deleted:
            return
        self._deleted.add(ep_index)
        self._save()
        logger.info("Soft-deleted episode %d (%d total pending)", ep_index, len(self._deleted))

    def restore(self, ep_index: int) -> None:
        """Restore a soft-deleted episode."""
        if ep_index not in self._deleted:
            raise ValueError(f"Episode {ep_index} is not deleted")
        self._deleted.discard(ep_index)
        self._save()
        logger.info("Restored episode %d (%d total pending)", ep_index, len(self._deleted))

    def get_deleted(self) -> set[int]:
        return self._deleted

    def export(self) -> dict:
        """Apply all pending deletions using lerobot's delete_episodes.

        Returns dict with 'deleted' and 'remaining' counts.
        """
        if not self._deleted:
            return {"deleted": 0, "remaining": self._ds.meta.total_episodes}

        deleted_indices = sorted(self._deleted)
        result = self._ds.delete_episodes(deleted_indices)

        # Clear session after successful export
        self._deleted.clear()
        self._save()

        logger.info(
            "Export complete: deleted %d episodes, %d remaining",
            result["deleted"],
            result["remaining"],
        )
        return result

    # Reward rule

    def get_reward_rule(self) -> RewardRule:
        return self._reward_rule

    def set_reward_rule(self, rule: RewardRule) -> None:
        self._reward_rule = rule
        self._save()

    # Label records

    def get_labels(self) -> dict[int, str]:
        return dict(self._labels)

    def set_label_record(self, ep_index: int, label: str | None) -> None:
        if label is None:
            self._labels.pop(ep_index, None)
        else:
            self._labels[ep_index] = label
        self._save()

    # Housekeeping

    def clear(self) -> None:
        """Reset session state and remove session file."""
        self._deleted.clear()
        self._reward_rule = RewardRule()
        self._labels.clear()
        if self._session_path and self._session_path.exists():
            self._session_path.unlink()

    def _save(self) -> None:
        """Persist session state to disk."""
        if self._session_path is None:
            return
        data = {
            "deleted_episodes": sorted(self._deleted),
            "reward_rule": self._reward_rule.model_dump(),
            "labels": {str(k): v for k, v in sorted(self._labels.items())},
        }
        with open(self._session_path, "w") as f:
            json.dump(data, f, indent=2)
