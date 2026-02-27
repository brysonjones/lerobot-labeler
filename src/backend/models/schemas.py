from pydantic import BaseModel


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


class RewardRule(BaseModel):
    step_reward: float = 0.0
    success_terminal_reward: float = 1.0
    failure_terminal_reward: float = 0.0


class UpdateRewardRuleRequest(BaseModel):
    reward_rule: RewardRule
    reapply: bool = True


REWARD_PRESETS: dict[str, "RewardRule"] = {
    "sparse_binary": RewardRule(step_reward=0.0, success_terminal_reward=1.0, failure_terminal_reward=0.0),
    "step_penalty": RewardRule(step_reward=-1.0, success_terminal_reward=0.0, failure_terminal_reward=-250.0),
    "terminal_signed": RewardRule(step_reward=0.0, success_terminal_reward=1.0, failure_terminal_reward=-1.0),
}
