"""Tests for DatasetService — loading, episode listing, signals, timestamps."""

from __future__ import annotations

import pytest

from backend.services.dataset_service import DatasetService


class TestDatasetLoading:
    def test_load_returns_info(self, lerobot_dataset):
        svc = DatasetService()
        info = svc.load(str(lerobot_dataset.root))

        assert info["repo_id"] == lerobot_dataset.repo_id
        assert info["fps"] == lerobot_dataset.fps
        assert info["total_episodes"] == lerobot_dataset.num_episodes
        assert info["total_frames"] == lerobot_dataset.num_episodes * lerobot_dataset.frames_per_episode
        assert "features" in info
        assert "video_keys" in info
        assert lerobot_dataset.camera_key in info["video_keys"]

    def test_load_nonexistent_raises(self):
        svc = DatasetService()
        with pytest.raises(FileNotFoundError):
            svc.load("/nonexistent/path")

    def test_load_with_save_to_copies(self, lerobot_dataset, tmp_path):
        svc = DatasetService()
        copy_name = "dataset-copy"
        svc.load(str(lerobot_dataset.root), save_to=copy_name)

        expected_copy = lerobot_dataset.root.parent / copy_name
        assert expected_copy.exists()
        assert svc.root == expected_copy
        assert (expected_copy / "meta" / "info.json").exists()

    def test_ensure_loaded_raises(self):
        svc = DatasetService()
        with pytest.raises(RuntimeError):
            svc.get_episode_list()


class TestEpisodeListing:
    def test_get_episode_list(self, dataset_service, lerobot_dataset):
        episodes = dataset_service.get_episode_list()
        assert len(episodes) == lerobot_dataset.num_episodes
        for ep in episodes:
            assert "episode_index" in ep
            assert "length" in ep
            assert "tasks" in ep
            assert ep["length"] == lerobot_dataset.frames_per_episode

    def test_get_episode_list_excludes(self, dataset_service):
        episodes = dataset_service.get_episode_list(exclude={0})
        indices = [ep["episode_index"] for ep in episodes]
        assert 0 not in indices


class TestTimestamps:
    def test_get_episode_timestamps(self, dataset_service, lerobot_dataset):
        ts = dataset_service.get_episode_timestamps(0)
        assert isinstance(ts, list)
        assert len(ts) == lerobot_dataset.frames_per_episode
        assert all(isinstance(t, float) for t in ts)

    def test_timestamps_cached(self, dataset_service):
        ts1 = dataset_service.get_episode_timestamps(0)
        ts2 = dataset_service.get_episode_timestamps(0)
        assert ts1 is ts2  # same object — cache hit


class TestSignals:
    def test_get_episode_signals(self, dataset_service, lerobot_dataset):
        result = dataset_service.get_episode_signals(0, ["action"])
        assert "timestamps" in result
        assert "signals" in result
        assert "action" in result["signals"]
        assert len(result["timestamps"]) == lerobot_dataset.frames_per_episode
        assert len(result["signals"]["action"]) == lerobot_dataset.frames_per_episode

    def test_get_episode_signals_missing_key(self, dataset_service):
        result = dataset_service.get_episode_signals(0, ["nonexistent_key"])
        assert "nonexistent_key" not in result["signals"]

    def test_get_signal_keys_excludes_video_and_meta(self, dataset_service, lerobot_dataset):
        keys = dataset_service.get_signal_keys()
        # Should include action
        assert "action" in keys
        # Should not include video, timestamp, frame_index, episode_index, index, task_index
        assert lerobot_dataset.camera_key not in keys
        for meta_key in ("timestamp", "frame_index", "episode_index", "index", "task_index"):
            assert meta_key not in keys
