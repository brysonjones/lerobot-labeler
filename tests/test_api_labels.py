"""API integration tests for /api/labels/* endpoints."""

from __future__ import annotations


class TestLabelEndpoints:
    def test_set_and_get_label(self, app_client):
        # Set
        resp = app_client.put("/api/labels/0", json={"label": "success"})
        assert resp.status_code == 200
        assert resp.json()["saved"] is True

        # Get
        resp = app_client.get("/api/labels/0")
        assert resp.status_code == 200
        assert resp.json()["label"] == "success"

    def test_set_invalid_label(self, app_client):
        resp = app_client.put("/api/labels/0", json={"label": "maybe"})
        assert resp.status_code == 400

    def test_remove_label(self, app_client):
        app_client.put("/api/labels/0", json={"label": "success"})
        resp = app_client.delete("/api/labels/0")
        assert resp.status_code == 200
        assert resp.json()["label"] is None

    def test_bulk_set_labels(self, app_client):
        resp = app_client.put(
            "/api/labels/bulk",
            json={"label": "success", "episode_indices": [0, 1]},
        )
        assert resp.status_code == 200
        assert resp.json()["labeled"] == 2

    def test_label_summary(self, app_client, lerobot_dataset):
        # Label some episodes first
        app_client.put("/api/labels/0", json={"label": "success"})
        app_client.put("/api/labels/1", json={"label": "failure"})

        resp = app_client.get("/api/labels/summary")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == lerobot_dataset.num_episodes
        assert data["success"] == 1
        assert data["failure"] == 1
        assert data["unlabeled"] == lerobot_dataset.num_episodes - 2


class TestRewardRuleEndpoints:
    def test_get_reward_rule(self, app_client):
        resp = app_client.get("/api/labels/reward-rule")
        assert resp.status_code == 200
        data = resp.json()
        assert "step_reward" in data
        assert "success_terminal_reward" in data
        assert "failure_terminal_reward" in data

    def test_set_reward_rule_with_reapply(self, app_client):
        # Label an episode first
        app_client.put("/api/labels/0", json={"label": "success"})

        # Change reward rule and reapply
        resp = app_client.put(
            "/api/labels/reward-rule",
            json={
                "reward_rule": {
                    "step_reward": -1.0,
                    "success_terminal_reward": 0.0,
                    "failure_terminal_reward": -10.0,
                },
                "reapply": True,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["reapplied"] == 1
        assert data["reward_rule"]["step_reward"] == -1.0

    def test_get_reward_presets(self, app_client):
        resp = app_client.get("/api/labels/reward-presets")
        assert resp.status_code == 200
        data = resp.json()
        assert "sparse_binary" in data
        assert "step_penalty" in data
        assert "terminal_signed" in data
