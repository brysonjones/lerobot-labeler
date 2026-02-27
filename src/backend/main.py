import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.config import Settings
from backend.routers import datasets, labels, ws
from backend.services.dataset_service import DatasetService
from backend.services.label_service import LabelService
from backend.services.session_service import SessionService
from backend.services.signal_service import SignalService
from backend.services.video_service import VideoService


def create_app() -> FastAPI:
    settings = Settings()
    app = FastAPI(title="LeRobot Labeler API", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Shared service instances
    dataset_service = DatasetService()
    video_service = VideoService(dataset_service)
    session_service = SessionService(dataset_service)
    label_service = LabelService(dataset_service, session_service)
    signal_service = SignalService(dataset_service)

    app.state.dataset_service = dataset_service
    app.state.video_service = video_service
    app.state.label_service = label_service
    app.state.session_service = session_service
    app.state.signal_service = signal_service

    app.include_router(datasets.router, prefix="/api/datasets", tags=["datasets"])
    app.include_router(labels.router, prefix="/api/labels", tags=["labels"])
    app.include_router(ws.router, prefix="/ws", tags=["websocket"])

    return app


app = create_app()

if __name__ == "__main__":
    uvicorn.run("backend.main:app", host="127.0.0.1", port=8976, reload=False)
