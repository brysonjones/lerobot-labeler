"""Shared fixtures for lerobot-labeler backend tests.

The core fixture is `make_dataset`, a factory that produces minimal but
structurally valid LeRobot v3.0 datasets on disk.  Every service-level
and API-level test builds on this.
"""

from __future__ import annotations

import json
from pathlib import Path
from types import SimpleNamespace

import cv2
import datasets as hf_datasets
import numpy as np
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
import pytest
from starlette.testclient import TestClient

from lerobot.datasets.utils import create_empty_dataset_info, DEFAULT_FEATURES


# ---------------------------------------------------------------------------
# Dataset factory
# ---------------------------------------------------------------------------

def _create_dummy_mp4(path: Path, num_frames: int, fps: int, width: int = 64, height: int = 48) -> None:
    """Write a small MP4 with solid-colour frames."""
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(str(path), fourcc, fps, (width, height))
    for i in range(num_frames):
        frame = np.full((height, width, 3), fill_value=(i * 25) % 256, dtype=np.uint8)
        writer.write(frame)
    writer.release()


def build_dataset(
    root: Path,
    *,
    num_episodes: int = 3,
    frames_per_episode: int = 10,
    fps: int = 30,
    camera_key: str = "observation.images.top",
    action_dim: int = 6,
) -> SimpleNamespace:
    """Create a minimal LeRobot v3.0 dataset at *root* and return metadata."""
    repo_id = root.name

    # -- Features ----------------------------------------------------------
    features = dict(DEFAULT_FEATURES)
    features[camera_key] = {"dtype": "video", "shape": (48, 64, 3), "names": None}
    features["action"] = {"dtype": "float32", "shape": (action_dim,), "names": None}

    # -- info.json ---------------------------------------------------------
    info = create_empty_dataset_info(
        codebase_version="v3.0",
        fps=fps,
        features=features,
        use_videos=True,
        robot_type="test_robot",
    )
    total_frames = num_episodes * frames_per_episode
    info["total_episodes"] = num_episodes
    info["total_frames"] = total_frames
    info["total_tasks"] = 1

    # Shapes must be stored as lists in JSON (load_info converts them to tuples)
    json_info = json.loads(json.dumps(info, default=_serialize))
    meta_dir = root / "meta"
    meta_dir.mkdir(parents=True, exist_ok=True)
    with open(meta_dir / "info.json", "w") as f:
        json.dump(json_info, f, indent=2)

    # -- tasks.parquet -----------------------------------------------------
    tasks_df = pd.DataFrame({"task_index": [0], "task": ["pick_object"]})
    tasks_df.to_parquet(meta_dir / "tasks.parquet", index=False)

    # -- episodes metadata (HuggingFace Dataset → parquet) -----------------
    ep_dicts: dict[str, list] = {
        "episode_index": [],
        "length": [],
        "tasks": [],
        "dataset_from_index": [],
        "dataset_to_index": [],
        "meta/episodes/chunk_index": [],
        "meta/episodes/file_index": [],
        "data/chunk_index": [],
        "data/file_index": [],
        f"videos/{camera_key}/chunk_index": [],
        f"videos/{camera_key}/file_index": [],
    }

    for ep_idx in range(num_episodes):
        from_idx = ep_idx * frames_per_episode
        to_idx = from_idx + frames_per_episode
        ep_dicts["episode_index"].append(ep_idx)
        ep_dicts["length"].append(frames_per_episode)
        ep_dicts["tasks"].append(["pick_object"])
        ep_dicts["dataset_from_index"].append(from_idx)
        ep_dicts["dataset_to_index"].append(to_idx)
        ep_dicts["meta/episodes/chunk_index"].append(0)
        ep_dicts["meta/episodes/file_index"].append(0)
        ep_dicts["data/chunk_index"].append(0)
        ep_dicts["data/file_index"].append(0)
        ep_dicts[f"videos/{camera_key}/chunk_index"].append(0)
        ep_dicts[f"videos/{camera_key}/file_index"].append(0)

    episodes_ds = hf_datasets.Dataset.from_dict(ep_dicts)
    episodes_dir = meta_dir / "episodes" / "chunk-000"
    episodes_dir.mkdir(parents=True, exist_ok=True)
    episodes_ds.to_parquet(str(episodes_dir / "file-000.parquet"))

    # -- data parquet (frame-level) ----------------------------------------
    rows: dict[str, list] = {
        "timestamp": [],
        "frame_index": [],
        "episode_index": [],
        "index": [],
        "task_index": [],
        "action": [],
    }
    global_idx = 0
    for ep_idx in range(num_episodes):
        for frame_idx in range(frames_per_episode):
            rows["timestamp"].append(float(frame_idx) / fps)
            rows["frame_index"].append(frame_idx)
            rows["episode_index"].append(ep_idx)
            rows["index"].append(global_idx)
            rows["task_index"].append(0)
            rows["action"].append(np.zeros(action_dim, dtype=np.float32).tolist())
            global_idx += 1

    data_dir = root / "data" / "chunk-000"
    data_dir.mkdir(parents=True, exist_ok=True)
    data_table = pa.Table.from_pydict(rows)
    pq.write_table(data_table, data_dir / "file-000.parquet", compression="snappy")

    # -- dummy MP4 video ---------------------------------------------------
    video_dir = root / "videos" / camera_key / "chunk-000"
    video_dir.mkdir(parents=True, exist_ok=True)
    _create_dummy_mp4(video_dir / "file-000.mp4", total_frames, fps)

    return SimpleNamespace(
        root=root,
        repo_id=repo_id,
        num_episodes=num_episodes,
        frames_per_episode=frames_per_episode,
        fps=fps,
        camera_key=camera_key,
        action_dim=action_dim,
    )


def _serialize(obj: object) -> object:
    """JSON serializer for tuples (shape fields)."""
    if isinstance(obj, tuple):
        return list(obj)
    raise TypeError(f"Not serializable: {type(obj)}")


# ---------------------------------------------------------------------------
# Pytest fixtures
# ---------------------------------------------------------------------------

@pytest.fixture()
def make_dataset(tmp_path: Path):
    """Factory fixture --call with optional overrides to get a fixture dataset."""
    def _factory(**kwargs) -> SimpleNamespace:
        ds_root = tmp_path / "test-dataset"
        ds_root.mkdir(exist_ok=True)
        return build_dataset(ds_root, **kwargs)
    return _factory


@pytest.fixture()
def lerobot_dataset(make_dataset) -> SimpleNamespace:
    """Convenience: default 3-episode, 10-frame dataset."""
    return make_dataset()


@pytest.fixture()
def dataset_service(lerobot_dataset):
    """A DatasetService that has already loaded the fixture dataset."""
    from backend.services.dataset_service import DatasetService

    svc = DatasetService()
    svc.load(str(lerobot_dataset.root))
    return svc


@pytest.fixture()
def session_service(dataset_service):
    """A SessionService backed by the fixture dataset."""
    from backend.services.session_service import SessionService

    svc = SessionService(dataset_service)
    svc.load()
    return svc


@pytest.fixture()
def label_service(dataset_service, session_service):
    """A LabelService wired to the fixture dataset + session."""
    from backend.services.label_service import LabelService

    return LabelService(dataset_service, session_service)


@pytest.fixture()
def app_client(lerobot_dataset):
    """FastAPI TestClient with the fixture dataset already loaded."""
    from backend.main import create_app

    app = create_app()
    ds_svc = app.state.dataset_service
    ds_svc.load(str(lerobot_dataset.root))
    app.state.session_service.load()

    with TestClient(app) as client:
        yield client
