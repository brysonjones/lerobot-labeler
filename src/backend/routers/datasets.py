from pathlib import Path

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse, StreamingResponse
from starlette.responses import FileResponse

from backend.models.schemas import DeleteEpisodesRequest
from backend.services.dataset_service import DatasetService
from backend.services.session_service import SessionService
from backend.services.signal_service import SignalService

router = APIRouter()


def _get_dataset_service(request: Request) -> DatasetService:
    return request.app.state.dataset_service


def _get_session_service(request: Request) -> SessionService:
    return request.app.state.session_service


def _get_signal_service(request: Request) -> SignalService:
    return request.app.state.signal_service


@router.get("/info")
async def get_dataset_info(request: Request):
    """Return info for the currently loaded dataset (no re-load)."""
    ds = _get_dataset_service(request)
    if not ds.meta:
        return JSONResponse(status_code=404, content={"error": "No dataset loaded"})
    return ds._build_info_dict()


@router.get("/load")
async def load_dataset(
    request: Request,
    path: str = Query(..., description="Local dataset directory path"),
    save_to: str | None = Query(None, description="Relative output path for saving to a new dataset"),
):
    ds = _get_dataset_service(request)
    try:
        info = ds.load(path, save_to=save_to)
    except FileNotFoundError as e:
        return JSONResponse(status_code=404, content={"error": str(e)})
    except FileExistsError as e:
        return JSONResponse(status_code=409, content={"error": str(e)})

    # Initialize session for this dataset (loads existing session if present)
    session = _get_session_service(request)
    session.load()

    return info


@router.post("/episodes/delete")
async def soft_delete_episode(request: Request, body: DeleteEpisodesRequest):
    """Soft-delete episodes (instant, no video re-encoding)."""
    session = _get_session_service(request)
    try:
        for idx in body.episode_indices:
            session.soft_delete(idx)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    return {"deleted_episodes": sorted(session.get_deleted())}


@router.post("/episodes/restore")
async def restore_episode(request: Request, body: DeleteEpisodesRequest):
    """Restore soft-deleted episodes."""
    session = _get_session_service(request)
    try:
        for idx in body.episode_indices:
            session.restore(idx)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    return {"deleted_episodes": sorted(session.get_deleted())}


@router.get("/session")
async def get_session(request: Request):
    """Return current session state (soft-deleted episode indices)."""
    session = _get_session_service(request)
    return {"deleted_episodes": sorted(session.get_deleted())}


@router.post("/export")
async def export_dataset(request: Request):
    """Apply all pending deletions using lerobot's delete_episodes.

    This is the slow operation that re-encodes video chunks. Only called once
    when the user is done labeling.
    """
    session = _get_session_service(request)
    ds = _get_dataset_service(request)

    deleted = session.get_deleted()
    if not deleted:
        return {
            "deleted": 0,
            "remaining": ds.meta.total_episodes,
            "info": ds._build_info_dict(),
        }

    try:
        result = session.export()
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

    # Re-initialize label service since episodes have been reindexed
    label_svc = request.app.state.label_service
    label_svc._initialized = False

    result["info"] = ds._build_info_dict()
    return result


@router.get("/episodes")
async def list_episodes(request: Request):
    ds = _get_dataset_service(request)
    session = _get_session_service(request)
    label_svc = request.app.state.label_service
    episodes = ds.get_episode_list(exclude=session.get_deleted())
    for ep in episodes:
        ep["label"] = label_svc.get_label(ep["episode_index"])
    return episodes


@router.get("/episodes/{ep_index}")
async def get_episode(request: Request, ep_index: int):
    ds = _get_dataset_service(request)
    label_svc = request.app.state.label_service
    episodes = ds.get_episode_list()
    if ep_index < 0 or ep_index >= len(episodes):
        return JSONResponse(status_code=404, content={"error": f"Episode {ep_index} not found"})
    ep = episodes[ep_index]
    ep["label"] = label_svc.get_label(ep_index)
    return ep


@router.get("/episodes/{ep_index}/signals")
async def get_episode_signals(request: Request, ep_index: int, keys: list[str] = Query(default=[])):
    ds = _get_dataset_service(request)
    if not keys:
        keys = ds.get_signal_keys()
    return ds.get_episode_signals(ep_index, keys)


@router.get("/signals/available")
async def get_available_signals(request: Request):
    svc = _get_signal_service(request)
    return {"keys": svc.get_available_signals()}


@router.get("/episodes/{ep_index}/video-meta")
async def get_episode_video_meta(request: Request, ep_index: int):
    """Return per-camera timing offsets for seeking within the video file."""
    ds = _get_dataset_service(request)
    if not ds.meta:
        return JSONResponse(status_code=400, content={"error": "No dataset loaded"})

    ep = ds.meta.episodes[ep_index]
    cameras: dict[str, dict] = {}
    for cam_key in ds.meta.video_keys:
        cameras[cam_key] = {
            "from_timestamp": ep.get(f"videos/{cam_key}/from_timestamp", 0.0),
            "to_timestamp": ep.get(f"videos/{cam_key}/to_timestamp", 0.0),
        }
    return cameras


@router.get("/episodes/{ep_index}/video/{camera_key:path}")
async def get_episode_video(request: Request, ep_index: int, camera_key: str):
    """Serve the MP4 video file with range-request support for seeking."""
    ds = _get_dataset_service(request)
    if not ds.meta:
        return JSONResponse(status_code=400, content={"error": "No dataset loaded"})

    video_path = Path(ds.root) / ds.meta.get_video_file_path(ep_index, camera_key)
    if not video_path.exists():
        return JSONResponse(status_code=404, content={"error": "Video not found"})

    file_size = video_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        range_str = range_header.replace("bytes=", "")
        start_str, end_str = range_str.split("-")
        start = int(start_str)
        end = int(end_str) if end_str else file_size - 1
        content_length = end - start + 1

        def iter_file():
            with open(video_path, "rb") as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            iter_file(),
            status_code=206,
            media_type="video/mp4",
            headers={
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(content_length),
            },
        )

    return FileResponse(
        str(video_path),
        media_type="video/mp4",
        headers={"Accept-Ranges": "bytes"},
    )
