import asyncio
import struct

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from backend.services.video_service import VideoService

router = APIRouter()


def _pack_frame(camera_key: str, frame_index: int, jpeg_bytes: bytes) -> bytes:
    """Pack a frame into binary: [cam_key_len:u16][cam_key][frame_idx:u32][data_len:u32][jpeg]"""
    cam_bytes = camera_key.encode("utf-8")
    header = struct.pack("<HII", len(cam_bytes), frame_index, len(jpeg_bytes))
    return header + cam_bytes + jpeg_bytes


@router.websocket("/stream")
async def stream_endpoint(websocket: WebSocket):
    await websocket.accept()
    video_svc: VideoService = websocket.app.state.video_service
    playback_task: asyncio.Task | None = None

    try:
        while True:
            msg = await websocket.receive_json()
            msg_type = msg.get("type")

            if msg_type == "request_frame":
                jpeg_bytes = await asyncio.to_thread(
                    video_svc.decode_frame_jpeg,
                    msg["episode_index"], msg["frame_index"], msg["camera_key"],
                )
                await websocket.send_bytes(
                    _pack_frame(msg["camera_key"], msg["frame_index"], jpeg_bytes)
                )

            elif msg_type == "request_frame_batch":
                camera_key = msg["camera_key"]
                frames = await asyncio.to_thread(
                    video_svc.decode_frame_range_jpeg,
                    msg["episode_index"], camera_key,
                    msg["start_frame"], msg.get("count", 10),
                )
                for frame_idx, jpeg_bytes in frames:
                    await websocket.send_bytes(
                        _pack_frame(camera_key, frame_idx, jpeg_bytes)
                    )

            elif msg_type == "subscribe_playback":
                if playback_task and not playback_task.done():
                    playback_task.cancel()
                playback_task = asyncio.create_task(
                    _stream_playback(websocket, video_svc, msg)
                )

            elif msg_type == "stop_playback":
                if playback_task and not playback_task.done():
                    playback_task.cancel()
                    playback_task = None

    except WebSocketDisconnect:
        pass
    finally:
        if playback_task and not playback_task.done():
            playback_task.cancel()


def _decode_batch(
    video_svc: VideoService,
    episode_index: int,
    camera_keys: list[str],
    start: int,
    count: int,
) -> dict[str, list[tuple[int, bytes]]]:
    """Decode a batch of frames for all cameras (CPU-bound, runs in thread)."""
    batches: dict[str, list[tuple[int, bytes]]] = {}
    for cam_key in camera_keys:
        batches[cam_key] = video_svc.decode_frame_range_jpeg(
            episode_index, cam_key, start, count
        )
    return batches


async def _stream_playback(
    websocket: WebSocket, video_svc: VideoService, msg: dict
) -> None:
    """Stream frames at the requested FPS for playback."""
    episode_index = msg["episode_index"]
    camera_keys = msg.get("camera_keys") or [msg.get("camera_key")]
    start_frame = msg.get("start_frame", 0)
    fps = msg.get("fps", 30)
    frame_interval = 1.0 / fps

    ds = video_svc._ds
    timestamps = ds.get_episode_timestamps(episode_index)
    total_frames = len(timestamps)

    batch_size = 30
    frame_idx = start_frame

    try:
        # Decode first batch in a thread to avoid blocking the event loop
        count = min(batch_size, total_frames - frame_idx)
        camera_batches = await asyncio.to_thread(
            _decode_batch, video_svc, episode_index, camera_keys, frame_idx, count
        )

        while camera_batches:
            batch_count = len(next(iter(camera_batches.values())))
            next_start = frame_idx + batch_count

            # Start decoding the NEXT batch in a thread while we send the current one
            next_future = None
            if next_start < total_frames:
                next_count = min(batch_size, total_frames - next_start)
                next_future = asyncio.ensure_future(
                    asyncio.to_thread(
                        _decode_batch, video_svc, episode_index, camera_keys,
                        next_start, next_count,
                    )
                )

            # Send current batch at the target framerate
            for i in range(batch_count):
                for cam_key in camera_keys:
                    fidx, jpeg_bytes = camera_batches[cam_key][i]
                    await websocket.send_bytes(
                        _pack_frame(cam_key, fidx, jpeg_bytes)
                    )
                await asyncio.sleep(frame_interval)

            frame_idx = next_start

            # Await the pre-decoded next batch (should already be ready)
            if next_future:
                camera_batches = await next_future
            else:
                break

    except asyncio.CancelledError:
        pass
