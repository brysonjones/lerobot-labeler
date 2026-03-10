"""Tests for SessionService --soft-delete, reward rule, and label persistence."""

from __future__ import annotations

import json

from backend.models.schemas import RewardRule
from backend.services.session_service import SessionService


class TestSessionService:
    def test_load_creates_empty_session(self, session_service):
        assert session_service.get_deleted() == set()
        assert session_service.get_reward_rule() == RewardRule()
        assert session_service.get_labels() == {}

    def test_soft_delete_and_get_deleted(self, session_service):
        session_service.soft_delete(0)
        assert 0 in session_service.get_deleted()

    def test_soft_delete_idempotent(self, session_service):
        session_service.soft_delete(0)
        session_service.soft_delete(0)
        assert session_service.get_deleted() == {0}

    def test_soft_delete_out_of_range_raises(self, session_service):
        import pytest

        with pytest.raises(ValueError):
            session_service.soft_delete(999)

    def test_restore(self, session_service):
        session_service.soft_delete(0)
        session_service.restore(0)
        assert 0 not in session_service.get_deleted()

    def test_restore_nonexistent_raises(self, session_service):
        import pytest

        with pytest.raises(ValueError):
            session_service.restore(0)

    def test_set_and_get_reward_rule(self, session_service):
        custom = RewardRule(step_reward=-1.0, success_terminal_reward=0.0, failure_terminal_reward=-10.0)
        session_service.set_reward_rule(custom)
        assert session_service.get_reward_rule() == custom

    def test_set_and_get_label_record(self, session_service):
        session_service.set_label_record(0, "success")
        assert session_service.get_labels() == {0: "success"}

    def test_set_label_record_none_removes(self, session_service):
        session_service.set_label_record(0, "success")
        session_service.set_label_record(0, None)
        assert 0 not in session_service.get_labels()

    def test_session_file_persists(self, dataset_service, session_service):
        session_service.soft_delete(1)
        session_service.set_label_record(0, "failure")
        session_service.set_reward_rule(
            RewardRule(step_reward=-1.0, success_terminal_reward=0.0, failure_terminal_reward=-10.0)
        )

        session_path = dataset_service.root / ".labeler-session.json"
        assert session_path.exists()

        with open(session_path) as f:
            data = json.load(f)
        assert "deleted_episodes" in data
        assert "reward_rule" in data
        assert "labels" in data
        assert 1 in data["deleted_episodes"]
        assert data["labels"]["0"] == "failure"

    def test_session_round_trip(self, dataset_service, session_service):
        """New SessionService on the same root should restore state from file."""
        session_service.soft_delete(2)
        session_service.set_label_record(1, "success")
        custom_rule = RewardRule(step_reward=0.5, success_terminal_reward=2.0, failure_terminal_reward=-3.0)
        session_service.set_reward_rule(custom_rule)

        new_session = SessionService(dataset_service)
        new_session.load()

        assert 2 in new_session.get_deleted()
        assert new_session.get_labels() == {1: "success"}
        assert new_session.get_reward_rule() == custom_rule

    def test_clear_removes_file(self, dataset_service, session_service):
        session_service.soft_delete(0)
        session_service.clear()

        session_path = dataset_service.root / ".labeler-session.json"
        assert not session_path.exists()
        assert session_service.get_deleted() == set()
        assert session_service.get_labels() == {}
        assert session_service.get_reward_rule() == RewardRule()
