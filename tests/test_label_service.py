"""Tests for LabelService --labeling, reward rules, parquet verification."""

from __future__ import annotations

import json

import pandas as pd
import pyarrow.parquet as pq
import pytest

from backend.models.schemas import REWARD_PRESETS, RewardRule
from backend.services.label_service import LabelService
from backend.services.session_service import SessionService


# Helpers 


def _read_episode_rewards(dataset_service, ep_index: int) -> pd.DataFrame:
    """Read parquet and return the episode's reward/is_done columns."""
    data_path = dataset_service.root / dataset_service.meta.get_data_file_path(ep_index)
    df = pd.read_parquet(data_path)
    return df[df["episode_index"] == ep_index][["reward", "is_done"]].reset_index(drop=True)


# Basic labeling 


class TestBasicLabeling:
    def test_set_and_get_label(self, label_service):
        label_service.set_label(0, "success")
        assert label_service.get_label(0) == "success"

    def test_get_label_unlabeled_returns_none(self, label_service):
        assert label_service.get_label(0) is None

    def test_set_invalid_label_raises(self, label_service):
        with pytest.raises(ValueError):
            label_service.set_label(0, "maybe")

    def test_remove_label(self, label_service):
        label_service.set_label(0, "success")
        label_service.remove_label(0)
        assert label_service.get_label(0) is None


# Parquet reward verification 


class TestRewardParquet:
    """Verify that reward values written to parquet match the active reward rule."""

    def test_sparse_binary_success(self, label_service, dataset_service, session_service):
        session_service.set_reward_rule(REWARD_PRESETS["sparse_binary"])
        label_service.set_label(0, "success")

        df = _read_episode_rewards(dataset_service, 0)
        non_terminal = df.iloc[:-1]
        terminal = df.iloc[-1]

        assert (non_terminal["reward"] == 0.0).all()
        assert terminal["reward"] == 1.0
        assert terminal["is_done"] is True or terminal["is_done"] == True  # noqa: E712

    def test_sparse_binary_failure(self, label_service, dataset_service, session_service):
        session_service.set_reward_rule(REWARD_PRESETS["sparse_binary"])
        label_service.set_label(0, "failure")

        df = _read_episode_rewards(dataset_service, 0)
        terminal = df.iloc[-1]

        assert terminal["reward"] == 0.0
        assert terminal["is_done"] is True or terminal["is_done"] == True  # noqa: E712

    def test_step_penalty_success(self, label_service, dataset_service, session_service):
        session_service.set_reward_rule(REWARD_PRESETS["step_penalty"])
        label_service.set_label(0, "success")

        df = _read_episode_rewards(dataset_service, 0)
        non_terminal = df.iloc[:-1]
        terminal = df.iloc[-1]

        assert (non_terminal["reward"] == -1.0).all()
        assert terminal["reward"] == 0.0

    def test_step_penalty_failure(self, label_service, dataset_service, session_service):
        session_service.set_reward_rule(REWARD_PRESETS["step_penalty"])
        label_service.set_label(0, "failure")

        df = _read_episode_rewards(dataset_service, 0)
        non_terminal = df.iloc[:-1]
        terminal = df.iloc[-1]

        assert (non_terminal["reward"] == -1.0).all()
        assert terminal["reward"] == -10.0

    def test_terminal_signed_success(self, label_service, dataset_service, session_service):
        session_service.set_reward_rule(REWARD_PRESETS["terminal_signed"])
        label_service.set_label(0, "success")

        df = _read_episode_rewards(dataset_service, 0)
        non_terminal = df.iloc[:-1]
        terminal = df.iloc[-1]

        assert (non_terminal["reward"] == 0.0).all()
        assert terminal["reward"] == 1.0

    def test_terminal_signed_failure(self, label_service, dataset_service, session_service):
        session_service.set_reward_rule(REWARD_PRESETS["terminal_signed"])
        label_service.set_label(0, "failure")

        df = _read_episode_rewards(dataset_service, 0)
        non_terminal = df.iloc[:-1]
        terminal = df.iloc[-1]

        assert (non_terminal["reward"] == 0.0).all()
        assert terminal["reward"] == -1.0

    def test_custom_rule(self, label_service, dataset_service, session_service):
        custom = RewardRule(step_reward=0.5, success_terminal_reward=10.0, failure_terminal_reward=-5.0)
        session_service.set_reward_rule(custom)
        label_service.set_label(0, "success")

        df = _read_episode_rewards(dataset_service, 0)
        non_terminal = df.iloc[:-1]
        terminal = df.iloc[-1]

        assert (non_terminal["reward"] == 0.5).all()
        assert terminal["reward"] == 10.0

    def test_remove_label_clears_parquet(self, label_service, dataset_service, session_service):
        label_service.set_label(0, "success")
        label_service.remove_label(0)

        df = _read_episode_rewards(dataset_service, 0)
        assert (df["reward"] == 0.0).all()
        assert (~df["is_done"]).all()


# Reapply & edge cases 


class TestReapplyAndEdgeCases:
    def test_reapply_all_updates_parquet(self, label_service, dataset_service, session_service):
        # Label two episodes with default rule
        label_service.set_label(0, "success")
        label_service.set_label(1, "failure")

        # Switch to step_penalty and reapply
        new_rule = REWARD_PRESETS["step_penalty"]
        session_service.set_reward_rule(new_rule)
        count = label_service.reapply_all(new_rule)
        assert count == 2

        # Verify episode 0 (success under step_penalty)
        df0 = _read_episode_rewards(dataset_service, 0)
        assert (df0.iloc[:-1]["reward"] == -1.0).all()
        assert df0.iloc[-1]["reward"] == 0.0

        # Verify episode 1 (failure under step_penalty)
        df1 = _read_episode_rewards(dataset_service, 1)
        assert (df1.iloc[:-1]["reward"] == -1.0).all()
        assert df1.iloc[-1]["reward"] == -10.0

    def test_ensure_features_exist_adds_to_info_json(self, label_service, dataset_service):
        # Before any labeling, info.json may not have reward/is_done
        info_path = dataset_service.root / "meta" / "info.json"
        with open(info_path) as f:
            info_before = json.load(f)

        # Remove reward/is_done if they exist
        info_before["features"].pop("reward", None)
        info_before["features"].pop("is_done", None)
        with open(info_path, "w") as f:
            json.dump(info_before, f)

        # Trigger feature creation
        label_service._ensure_features_exist()

        with open(info_path) as f:
            info_after = json.load(f)
        assert "reward" in info_after["features"]
        assert "is_done" in info_after["features"]
        assert info_after["features"]["reward"]["dtype"] == "float32"
        assert info_after["features"]["is_done"]["dtype"] == "bool"

    def test_get_summary_counts(self, label_service, dataset_service):
        label_service.set_label(0, "success")
        label_service.set_label(1, "failure")

        summary = label_service.get_summary()
        assert summary["total"] == 3
        assert summary["success"] == 1
        assert summary["failure"] == 1
        assert summary["labeled"] == 2
        assert summary["unlabeled"] == 1

    def test_single_frame_episode(self, make_dataset):
        """An episode with only 1 frame should get terminal reward on that frame."""
        from backend.services.dataset_service import DatasetService
        from backend.services.session_service import SessionService

        ds_ns = make_dataset(num_episodes=1, frames_per_episode=1)
        ds_svc = DatasetService()
        ds_svc.load(str(ds_ns.root))
        session_svc = SessionService(ds_svc)
        session_svc.load()
        label_svc = LabelService(ds_svc, session_svc)

        label_svc.set_label(0, "success")
        df = _read_episode_rewards(ds_svc, 0)
        assert len(df) == 1
        assert df.iloc[0]["reward"] == 1.0
        assert df.iloc[0]["is_done"] is True or df.iloc[0]["is_done"] == True  # noqa: E712


# Legacy inference 


class TestLegacyInference:
    def test_legacy_parquet_inference(self, dataset_service):
        """Manually write reward/is_done to parquet, then verify a fresh
        LabelService (with empty session) infers labels correctly."""
        import pyarrow as pa

        data_path = dataset_service.root / dataset_service.meta.get_data_file_path(0)
        df = pd.read_parquet(data_path)

        # Manually inject reward/is_done for episode 0 (success)
        if "reward" not in df.columns:
            df["reward"] = 0.0
        if "is_done" not in df.columns:
            df["is_done"] = False

        ep0_mask = df["episode_index"] == 0
        ep0_last = df.index[ep0_mask][-1]
        df.at[ep0_last, "reward"] = 1.0
        df.at[ep0_last, "is_done"] = True

        table = pa.Table.from_pandas(df, preserve_index=False)
        pq.write_table(table, data_path, compression="snappy")

        # Create fresh session (no labels stored) and LabelService
        session_svc = SessionService(dataset_service)
        session_svc.load()
        # Ensure session has no labels
        assert session_svc.get_labels() == {}

        label_svc = LabelService(dataset_service, session_svc)
        label_svc.load_all_labels()

        assert label_svc.get_label(0) == "success"


# Reward presets 


class TestRewardPresets:
    def test_presets_have_expected_keys(self):
        assert set(REWARD_PRESETS.keys()) == {"sparse_binary", "step_penalty", "terminal_signed"}

    def test_sparse_binary_values(self):
        p = REWARD_PRESETS["sparse_binary"]
        assert p.step_reward == 0.0
        assert p.success_terminal_reward == 1.0
        assert p.failure_terminal_reward == 0.0

    def test_step_penalty_values(self):
        p = REWARD_PRESETS["step_penalty"]
        assert p.step_reward == -1.0
        assert p.success_terminal_reward == 0.0
        assert p.failure_terminal_reward == -10.0

    def test_terminal_signed_values(self):
        p = REWARD_PRESETS["terminal_signed"]
        assert p.step_reward == 0.0
        assert p.success_terminal_reward == 1.0
        assert p.failure_terminal_reward == -1.0
