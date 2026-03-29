# LeRobot Labeler

A desktop tool for labeling [LeRobot](https://github.com/huggingface/lerobot) v3.0 robot demonstration datasets with success/failure rewards for reinforcement learning.

Load a dataset, review episodes across multiple camera angles with synchronized signal plots, and label each episode. Rewards are written directly to parquet so the dataset is immediately ready for training.

![LeRobot Labeler demo](public/lerobot_labeler.gif)

**Note:** This project is not officially associated with the LeRobot project and is a separate effort.

## Features

- **Multi-camera video playback**
- **Signal visualization** — plot any sensor channel (joint states, actions, gripper) with zoom, pan, and legend toggling
- **Drag-and-drop layout** — arrange video feeds and signal charts however you want
- **Configurable reward functions** — sparse binary, step penalty, terminal signed, or define custom rules
- **Bulk operations** — label all episodes at once, and/or then set individually
- **Soft-delete** — mark episodes for deletion without re-encoding, then exporting when ready
- **Session persistence** — close and reopen without losing progress
- **Keybindings** — label, navigate, and play with keybindings

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `S` | Label success |
| `F` | Label failure |
| `Space` | Play / pause |
| `Left` / `Right` | Step one frame |
| `[` / `]` | Previous / next episode |

## Quick Start

**Requirements:** Python 3.10+, Node.js 18+, [uv](https://docs.astral.sh/uv/)

```bash
cd lerobot-labeler

# Install dependencies
npm install
uv sync

# Build the frontend and Electron shell
npm run build

# Launch the app
npm start
```

This starts the Python backend, serves the production frontend, and opens the Electron desktop window.

> **Note:** We have not yet set up the build and packaging process for an all-in-one Electron app install yet. You need the dependencies above to build and run from source. If a standalone installer (AppImage, dmg, etc.) with a bundled Python environment would be useful to you, please file an issue and/or submit a PR.

## How It Works

**Frontend:** Next.js + React + Tailwind CSS, statically exported and served inside Electron.

**Backend:** FastAPI (Python) loads the dataset via `lerobot.datasets.LeRobotDatasetMetadata`, serves video files with range-request support, reads/writes parquet for signal data and reward labels, and manages session state in a `.labeler-session.json` file alongside the dataset.

**Desktop shell:** Electron wraps the frontend and launches the backend process.

### Reward Rules

Every label writes per-timestep rewards to the `reward` column in parquet:

| Preset | Step (t < T) | Success terminal | Failure terminal |
|--------|-------------|-----------------|-----------------|
| Sparse Binary | 0.0 | 1.0 | 0.0 |
| Step Penalty | -1.0 | 0.0 | -10.0 |
| Terminal Signed | 0.0 | 1.0 | -1.0 |

Custom rules let you set any three values. Changing the rule re-applies to all previously labeled episodes.

## Dataset Format

Expects a local LeRobot v3.0 dataset directory:

```
my-dataset/
├── meta/
│   ├── info.json
│   ├── tasks.parquet
│   └── episodes/chunk-000/file-000.parquet
├── data/chunk-000/file-000.parquet
└── videos/{camera_key}/chunk-000/file-000.mp4
```

The labeler adds `reward` (float32) and `is_done` (bool) columns to the data parquet files. No other files are modified during labeling. Episode deletion (export) re-encodes video files via lerobot's `delete_episodes` utility.

## Contributing

If you're interested in contributing, find a bug you want to fix, or have capabilities you'd like to report as an issue, all feedback and support are welcome!

### Development Setup

```bash
# install deps
npm install
uv sync

# Run in dev mode (backend + frontend + desktop app) for re-compiling while running
npm run dev:all
```

### Project Structure

```
src/
├── app/              # Next.js pages (home + labeler)
├── components/       # React components (video, timeline, labels, charts)
├── hooks/            # React hooks (useDataset, useLabels, useRewardRule)
├── lib/              # API client, types
├── backend/
│   ├── main.py       # FastAPI app
│   ├── routers/      # REST endpoints (/api/datasets, /api/labels, /ws)
│   ├── services/     # Business logic (dataset, label, session, video, signal)
│   └── models/       # Pydantic schemas
tests/                # pytest suite (format compat, services, API integration)
```

### Tests

The test suite includes format sentinel tests that verify our assumptions about lerobot's API surface, so if lerobot updates and changes its dataset format, these tests will let us know so we can freeze the version, and patch the changes.

```bash
uv run pytest tests/ -v
```
