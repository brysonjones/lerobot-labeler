import re

from pydantic import BaseModel, field_validator, model_validator


class DatasetInfo(BaseModel):
    repo_id: str
    fps: int
    total_episodes: int
    total_frames: int
    features: dict
    video_keys: list[str]
    camera_keys: list[str]
    robot_type: str | None


class EpisodeSummary(BaseModel):
    episode_index: int
    length: int
    tasks: list[str]
    label: str | None = None  # "success" | "failure" | None


class SignalData(BaseModel):
    timestamps: list[float]
    signals: dict[str, list]


class LabelRequest(BaseModel):
    label: str  # "success" | "failure"


class LabelResponse(BaseModel):
    episode_index: int
    label: str | None
    saved: bool = True


class LabelSummary(BaseModel):
    total: int
    labeled: int
    success: int
    failure: int
    unlabeled: int


class BulkLabelRequest(BaseModel):
    label: str  # "success" | "failure"
    episode_indices: list[int]


class DeleteEpisodesRequest(BaseModel):
    episode_indices: list[int]


_RESERVED_COLUMNS = frozenset({
    "episode_index", "frame_index", "timestamp", "index", "task_index",
})


class RewardRule(BaseModel):
    step_reward: float = 0.0
    success_terminal_reward: float = 1.0
    failure_terminal_reward: float = 0.0
    reward_column_name: str = "reward"
    is_done_column_name: str = "is_done"

    @field_validator("reward_column_name", "is_done_column_name")
    @classmethod
    def _valid_column_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Column name must not be empty")
        if not re.match(r"^[a-zA-Z_][a-zA-Z0-9_]*$", v):
            raise ValueError(f"'{v}' is not a valid identifier")
        if v in _RESERVED_COLUMNS:
            raise ValueError(f"'{v}' conflicts with a reserved dataset column")
        return v

    @model_validator(mode="after")
    def _columns_differ(self) -> "RewardRule":
        if self.reward_column_name == self.is_done_column_name:
            raise ValueError("reward_column_name and is_done_column_name must be different")
        return self


class UpdateRewardRuleRequest(BaseModel):
    reward_rule: RewardRule
    reapply: bool = True


REWARD_PRESETS: dict[str, "RewardRule"] = {
    "sparse_binary": RewardRule(step_reward=0.0, success_terminal_reward=1.0, failure_terminal_reward=0.0),
    "step_penalty": RewardRule(step_reward=-1.0, success_terminal_reward=0.0, failure_terminal_reward=-250.0),
    "terminal_signed": RewardRule(step_reward=0.0, success_terminal_reward=1.0, failure_terminal_reward=-1.0),
}
