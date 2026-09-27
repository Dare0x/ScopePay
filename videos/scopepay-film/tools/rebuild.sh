#!/usr/bin/env bash
# Full rebuild: frames (without recordings) → durations → index → transitions → HUD → frames with recordings.
set -e
cd "$(dirname "$0")/.."
SK=~/.claude/skills/product-launch-video/scripts
node tools/build-frames.mjs --no-video "$@"
node $SK/audio.mjs sync-durations --audio-meta ./audio_meta.json --storyboard ./STORYBOARD.md
node $SK/assemble-index.mjs --storyboard ./STORYBOARD.md --hyperframes . | tail -3
node $SK/transitions.mjs inject --storyboard ./STORYBOARD.md --hyperframes . | tail -1
node tools/add-hud.mjs
node tools/build-frames.mjs | tail -1
