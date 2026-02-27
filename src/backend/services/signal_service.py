from backend.services.dataset_service import DatasetService


class SignalService:
    """Extracts signal data from a loaded dataset. Thin wrapper around DatasetService."""

    def __init__(self, dataset_service: DatasetService) -> None:
        self._ds = dataset_service

    def get_available_signals(self) -> list[str]:
        return self._ds.get_signal_keys()

    def get_episode_signals(self, ep_index: int, keys: list[str]) -> dict:
        return self._ds.get_episode_signals(ep_index, keys)
