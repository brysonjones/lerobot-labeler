from collections import OrderedDict
from pathlib import Path

import cv2
import numpy as np
import torch

from lerobot.datasets.video_utils import decode_video_frames

from backend.services.dataset_service import DatasetService


class VideoService:
    """Handles video frame decoding and JPEG encoding for streaming."""

    MAX_CACHE_SIZE = 500

    def __init__(self, dataset_service: DatasetService) -> None:
        self._ds = dataset_service
        self._frame_cache: OrderedDict[tuple[int, str, int], bytes] = OrderedDict()

    def decode_frame_jpeg(
        self,
        episode_index: int,
        frame_index: int,
        camera_key: str,
        quality: int = 85,
    ) -> bytes:
        """Decode a single video frame and return as JPEG bytes."""
        cache_key = (episode_index, camera_key, frame_index)
        if cache_key in self._frame_cache:
            self._frame_cache.move_to_end(cache_key)
            return self._frame_cache[cache_key]

        meta = self._ds.meta
        video_path = self._ds.root / meta.get_video_file_path(episode_index, camera_key)

        # Get the absolute timestamp in the MP4 file
        ep = meta.episodes[episode_index]
        from_timestamp = ep[f"videos/{camera_key}/from_timestamp"]
        timestamps = self._ds.get_episode_timestamps(episode_index)
        frame_ts = timestamps[frame_index]
        absolute_ts = from_timestamp + frame_ts

        frames = decode_video_frames(
            video_path, [absolute_ts], tolerance_s=0.04, backend="pyav"
        )
        jpeg_bytes = self._tensor_to_jpeg(frames[0], quality)
        self._cache_put(cache_key, jpeg_bytes)
        return jpeg_bytes

    def decode_frame_range_jpeg(
        self,
        episode_index: int,
        camera_key: str,
        start_frame: int,
        count: int,
        quality: int = 85,
    ) -> list[tuple[int, bytes]]:
        """Decode a batch of consecutive frames. Returns list of (frame_index, jpeg_bytes)."""
        meta = self._ds.meta
        video_path = self._ds.root / meta.get_video_file_path(episode_index, camera_key)
        ep = meta.episodes[episode_index]
        from_timestamp = ep[f"videos/{camera_key}/from_timestamp"]
        timestamps = self._ds.get_episode_timestamps(episode_index)

        ep_length = len(timestamps)
        end_frame = min(start_frame + count, ep_length)

        absolute_timestamps = [
            from_timestamp + timestamps[i] for i in range(start_frame, end_frame)
        ]

        frames = decode_video_frames(
            video_path, absolute_timestamps, tolerance_s=0.04, backend="pyav"
        )

        results = []
        for i, frame in enumerate(frames):
            frame_idx = start_frame + i
            cache_key = (episode_index, camera_key, frame_idx)
            if cache_key in self._frame_cache:
                results.append((frame_idx, self._frame_cache[cache_key]))
            else:
                jpeg_bytes = self._tensor_to_jpeg(frame, quality)
                self._cache_put(cache_key, jpeg_bytes)
                results.append((frame_idx, jpeg_bytes))
        return results

    def clear_cache(self) -> None:
        self._frame_cache.clear()

    def _tensor_to_jpeg(self, frame: torch.Tensor, quality: int) -> bytes:
        """Convert a [C, H, W] uint8 tensor to JPEG bytes."""
        frame_np = frame.permute(1, 2, 0).numpy()
        if frame_np.dtype != np.uint8:
            frame_np = (frame_np * 255).astype(np.uint8)
        frame_bgr = cv2.cvtColor(frame_np, cv2.COLOR_RGB2BGR)
        _, jpeg_buf = cv2.imencode(".jpg", frame_bgr, [cv2.IMWRITE_JPEG_QUALITY, quality])
        return jpeg_buf.tobytes()

    def _cache_put(self, key: tuple, value: bytes) -> None:
        self._frame_cache[key] = value
        if len(self._frame_cache) > self.MAX_CACHE_SIZE:
            self._frame_cache.popitem(last=False)
