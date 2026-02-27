from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from backend.models.schemas import (
    BulkLabelRequest,
    LabelRequest,
    REWARD_PRESETS,
    UpdateRewardRuleRequest,
)
from backend.services.label_service import LabelService
from backend.services.session_service import SessionService

router = APIRouter()


def _get_label_service(request: Request) -> LabelService:
    return request.app.state.label_service


def _get_session_service(request: Request) -> SessionService:
    return request.app.state.session_service


@router.get("/summary")
async def label_summary(request: Request):
    svc = _get_label_service(request)
    session = _get_session_service(request)
    deleted = session.get_deleted()
    summary = svc.get_summary()
    # Adjust counts to exclude soft-deleted episodes
    if deleted:
        deleted_success = sum(
            1 for idx in deleted if svc.get_label(idx) == "success"
        )
        deleted_failure = sum(
            1 for idx in deleted if svc.get_label(idx) == "failure"
        )
        deleted_labeled = deleted_success + deleted_failure
        summary["total"] -= len(deleted)
        summary["success"] -= deleted_success
        summary["failure"] -= deleted_failure
        summary["labeled"] -= deleted_labeled
        summary["unlabeled"] = summary["total"] - summary["labeled"]
    return summary


@router.put("/bulk")
async def bulk_set_label(request: Request, body: BulkLabelRequest):
    """Set the same label on multiple episodes at once."""
    svc = _get_label_service(request)
    if body.label not in ("success", "failure"):
        return JSONResponse(
            status_code=400,
            content={"error": f"Label must be 'success' or 'failure', got '{body.label}'"},
        )
    for idx in body.episode_indices:
        svc.set_label(idx, body.label)
    return {"labeled": len(body.episode_indices), "label": body.label}


@router.delete("/bulk")
async def bulk_remove_labels(request: Request):
    """Remove labels from all episodes."""
    svc = _get_label_service(request)
    ds = request.app.state.dataset_service
    session = _get_session_service(request)
    deleted = session.get_deleted()
    count = 0
    for idx in range(ds.meta.total_episodes):
        if deleted and idx in deleted:
            continue
        if svc.get_label(idx) is not None:
            svc.remove_label(idx)
            count += 1
    return {"cleared": count}


@router.get("/reward-rule")
async def get_reward_rule(request: Request):
    session = _get_session_service(request)
    return session.get_reward_rule().model_dump()


@router.put("/reward-rule")
async def set_reward_rule(request: Request, body: UpdateRewardRuleRequest):
    session = _get_session_service(request)
    svc = _get_label_service(request)
    session.set_reward_rule(body.reward_rule)
    reapplied = 0
    if body.reapply:
        reapplied = svc.reapply_all(body.reward_rule)
    return {"reward_rule": body.reward_rule.model_dump(), "reapplied": reapplied}


@router.get("/reward-presets")
async def get_reward_presets(request: Request):
    return {name: rule.model_dump() for name, rule in REWARD_PRESETS.items()}


@router.get("/{ep_index}")
async def get_label(request: Request, ep_index: int):
    svc = _get_label_service(request)
    label = svc.get_label(ep_index)
    return {"episode_index": ep_index, "label": label}


@router.put("/{ep_index}")
async def set_label(request: Request, ep_index: int, body: LabelRequest):
    svc = _get_label_service(request)
    try:
        svc.set_label(ep_index, body.label)
    except ValueError as e:
        return JSONResponse(status_code=400, content={"error": str(e)})
    return {"episode_index": ep_index, "label": body.label, "saved": True}


@router.delete("/{ep_index}")
async def remove_label(request: Request, ep_index: int):
    svc = _get_label_service(request)
    svc.remove_label(ep_index)
    return {"episode_index": ep_index, "label": None, "saved": True}
