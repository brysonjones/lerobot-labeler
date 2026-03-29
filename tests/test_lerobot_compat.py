"""Format sentinel tests --tripwire for LeRobot API/format changes.

These tests verify our assumptions about lerobot's API surface.  When
lerobot ships a breaking change, these are designed to fail first and
tell us exactly *what* changed.
"""

from __future__ import annotations

import inspect
from pathlib import Path

import pandas as pd
import pyarrow.parquet as pq
import torch
from lerobot.datasets.lerobot_dataset import LeRobotDataset, LeRobotDatasetMetadata
from lerobot.datasets.video_utils import decode_video_frames


# LeRobotDatasetMetadata constructor & loading 


class TestMetadataAPI:
    """Verify our assumptions about LeRobotDatasetMetadata's public API."""

    def test_constructor_signature(self):
        sig = inspect.signature(LeRobotDatasetMetadata.__init__)
        params = list(sig.parameters.keys())
        assert "repo_id" in params
        assert "root" in params

    def test_loads_from_fixture(self, lerobot_dataset):
        meta = LeRobotDatasetMetadata(
            repo_id=lerobot_dataset.repo_id,
            root=lerobot_dataset.root,
        )
        assert meta is not None

    def test_info_has_expected_keys(self, lerobot_dataset):
        meta = LeRobotDatasetMetadata(
            repo_id=lerobot_dataset.repo_id,
            root=lerobot_dataset.root,
        )
        expected_keys = {
            "codebase_version",
            "fps",
            "features",
            "robot_type",
            "total_episodes",
            "total_frames",
            "data_path",
            "video_path",
        }
        assert expected_keys.issubset(set(meta.info.keys())), (
            f"Missing keys: {expected_keys - set(meta.info.keys())}"
        )

    def test_properties(self, lerobot_dataset):
        meta = LeRobotDatasetMetadata(
            repo_id=lerobot_dataset.repo_id,
            root=lerobot_dataset.root,
        )
        assert isinstance(meta.fps, int)
        assert isinstance(meta.total_episodes, int)
        assert isinstance(meta.total_frames, int)
        assert meta.robot_type is None or isinstance(meta.robot_type, str)
        assert isinstance(meta.video_keys, list)
        assert isinstance(meta.camera_keys, list)
        assert isinstance(meta.features, dict)

    def test_feature_entry_schema(self, lerobot_dataset):
        """Every feature entry must have dtype, shape, and names keys."""
        meta = LeRobotDatasetMetadata(
            repo_id=lerobot_dataset.repo_id,
            root=lerobot_dataset.root,
        )
        for key, ft in meta.features.items():
            assert "dtype" in ft, f"Feature '{key}' missing 'dtype'"
            assert "shape" in ft, f"Feature '{key}' missing 'shape'"
            assert "names" in ft, f"Feature '{key}' missing 'names'"
            # load_info converts shape lists to tuples
            assert isinstance(ft["shape"], tuple), (
                f"Feature '{key}' shape should be tuple, got {type(ft['shape'])}"
            )

    def test_video_feature_dtype(self, lerobot_dataset):
        meta = LeRobotDatasetMetadata(
            repo_id=lerobot_dataset.repo_id,
            root=lerobot_dataset.root,
        )
        for key in meta.video_keys:
            assert meta.features[key]["dtype"] == "video"

    def test_episodes_indexable(self, lerobot_dataset):
        meta = LeRobotDatasetMetadata(
            repo_id=lerobot_dataset.repo_id,
            root=lerobot_dataset.root,
        )
        assert len(meta.episodes) == lerobot_dataset.num_episodes
        ep = meta.episodes[0]
        assert "episode_index" in ep
        assert "length" in ep
        assert "tasks" in ep
        assert "data/chunk_index" in ep
        assert "data/file_index" in ep

    def test_episode_video_metadata_keys(self, lerobot_dataset):
        meta = LeRobotDatasetMetadata(
            repo_id=lerobot_dataset.repo_id,
            root=lerobot_dataset.root,
        )
        cam = lerobot_dataset.camera_key
        ep = meta.episodes[0]
        assert f"videos/{cam}/chunk_index" in ep
        assert f"videos/{cam}/file_index" in ep

    def test_get_data_file_path(self, lerobot_dataset):
        meta = LeRobotDatasetMetadata(
            repo_id=lerobot_dataset.repo_id,
            root=lerobot_dataset.root,
        )
        path = meta.get_data_file_path(0)
        assert isinstance(path, Path)
        assert "data/" in str(path)
        assert str(path).endswith(".parquet")

    def test_get_video_file_path(self, lerobot_dataset):
        meta = LeRobotDatasetMetadata(
            repo_id=lerobot_dataset.repo_id,
            root=lerobot_dataset.root,
        )
        path = meta.get_video_file_path(0, lerobot_dataset.camera_key)
        assert isinstance(path, Path)
        assert "videos/" in str(path)
        assert str(path).endswith(".mp4")

    def test_tasks_is_dataframe(self, lerobot_dataset):
        meta = LeRobotDatasetMetadata(
            repo_id=lerobot_dataset.repo_id,
            root=lerobot_dataset.root,
        )
        assert isinstance(meta.tasks, pd.DataFrame)


# Parquet schema 


class TestParquetSchema:
    """Verify parquet column names and types match our expectations."""

    def test_required_columns(self, lerobot_dataset):
        data_path = lerobot_dataset.root / "data" / "chunk-000" / "file-000.parquet"
        schema = pq.read_schema(data_path)
        col_names = schema.names
        assert "episode_index" in col_names
        assert "timestamp" in col_names
        assert "frame_index" in col_names

    def test_column_types(self, lerobot_dataset):
        data_path = lerobot_dataset.root / "data" / "chunk-000" / "file-000.parquet"
        schema = pq.read_schema(data_path)
        # episode_index and frame_index should be integer types
        assert schema.field("episode_index").type in (
            "int64", "int32",
        ) or "int" in str(schema.field("episode_index").type)
        assert "float" in str(schema.field("timestamp").type) or "double" in str(
            schema.field("timestamp").type
        )


# decode_video_frames 


class TestDecodeVideoFrames:
    """Verify the lerobot video decoding function's signature and behaviour."""

    def test_signature(self):
        sig = inspect.signature(decode_video_frames)
        params = list(sig.parameters.keys())
        assert "video_path" in params
        assert "timestamps" in params
        assert "tolerance_s" in params
        assert "backend" in params

    def test_returns_tensor(self, lerobot_dataset):
        video_path = (
            lerobot_dataset.root
            / "videos"
            / lerobot_dataset.camera_key
            / "chunk-000"
            / "file-000.mp4"
        )
        result = decode_video_frames(
            video_path, [0.0], tolerance_s=0.04, backend="pyav"
        )
        assert isinstance(result, torch.Tensor)
        assert result.ndim == 4  # [N, C, H, W]
        assert result.shape[0] == 1


# delete_episodes 


class TestDeleteEpisodes:
    """Verify the lerobot delete_episodes utility is importable and has the expected signature."""

    def test_importable(self):
        from lerobot.datasets.dataset_tools import delete_episodes  # noqa: F401

    def test_signature(self):
        from lerobot.datasets.dataset_tools import delete_episodes

        sig = inspect.signature(delete_episodes)
        params = list(sig.parameters.keys())
        assert "dataset" in params
        assert "episode_indices" in params


# LeRobotDataset constructor 


class TestLeRobotDatasetSignature:
    def test_constructor_accepts_repo_id_and_root(self):
        sig = inspect.signature(LeRobotDataset.__init__)
        params = list(sig.parameters.keys())
        assert "repo_id" in params
        assert "root" in params
