"""API integration tests for /api/datasets/* endpoints."""

from __future__ import annotations


class TestDatasetEndpoints:
    def test_get_info(self, app_client, lerobot_dataset):
        resp = app_client.get("/api/datasets/info")
        assert resp.status_code == 200
        data = resp.json()
        assert data["repo_id"] == lerobot_dataset.repo_id
        assert data["fps"] == lerobot_dataset.fps
        assert data["total_episodes"] == lerobot_dataset.num_episodes

    def test_list_episodes(self, app_client, lerobot_dataset):
        resp = app_client.get("/api/datasets/episodes")
        assert resp.status_code == 200
        episodes = resp.json()
        assert len(episodes) == lerobot_dataset.num_episodes
        assert "episode_index" in episodes[0]
        assert "length" in episodes[0]
        assert "label" in episodes[0]

    def test_get_single_episode(self, app_client):
        resp = app_client.get("/api/datasets/episodes/0")
        assert resp.status_code == 200
        data = resp.json()
        assert data["episode_index"] == 0

    def test_get_invalid_episode(self, app_client):
        resp = app_client.get("/api/datasets/episodes/999")
        assert resp.status_code == 404

    def test_get_episode_signals(self, app_client, lerobot_dataset):
        resp = app_client.get("/api/datasets/episodes/0/signals?keys=action")
        assert resp.status_code == 200
        data = resp.json()
        assert "timestamps" in data
        assert "signals" in data

    def test_available_signals(self, app_client):
        resp = app_client.get("/api/datasets/signals/available")
        assert resp.status_code == 200
        data = resp.json()
        assert "keys" in data
        assert "action" in data["keys"]

    def test_get_session(self, app_client):
        resp = app_client.get("/api/datasets/session")
        assert resp.status_code == 200
        data = resp.json()
        assert "deleted_episodes" in data

    def test_soft_delete_and_restore(self, app_client):
        # Delete
        resp = app_client.post(
            "/api/datasets/episodes/delete",
            json={"episode_indices": [0]},
        )
        assert resp.status_code == 200
        assert 0 in resp.json()["deleted_episodes"]

        # Verify session
        resp = app_client.get("/api/datasets/session")
        assert 0 in resp.json()["deleted_episodes"]

        # Restore
        resp = app_client.post(
            "/api/datasets/episodes/restore",
            json={"episode_indices": [0]},
        )
        assert resp.status_code == 200
        assert 0 not in resp.json()["deleted_episodes"]

    def test_get_video_meta(self, app_client, lerobot_dataset):
        resp = app_client.get("/api/datasets/episodes/0/video-meta")
        assert resp.status_code == 200
        data = resp.json()
        assert lerobot_dataset.camera_key in data
