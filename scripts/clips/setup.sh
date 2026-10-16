#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p .cache/clips
if [ ! -x .cache/clips/venv/bin/python ]; then python3 -m venv .cache/clips/venv; fi
.cache/clips/venv/bin/python -m pip install -r scripts/clips/requirements.txt
if [ ! -d .cache/clips/TalkNet ]; then
  git clone https://github.com/TaoRuijie/TalkNet-ASD.git .cache/clips/TalkNet
  git -C .cache/clips/TalkNet checkout 6d6821479af485e251c4991487e40573b42181b4
fi
if [ ! -f .cache/clips/talknet.model ]; then
  .cache/clips/venv/bin/gdown 1AbN9fCf9IexMxEKXLQY2KYBlb-IhSEea -O .cache/clips/talknet.model.tmp
  mv .cache/clips/talknet.model.tmp .cache/clips/talknet.model
fi
if [ ! -f .cache/clips/face.onnx ]; then
  curl -fL https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx -o .cache/clips/face.onnx.tmp
  mv .cache/clips/face.onnx.tmp .cache/clips/face.onnx
fi
shasum -a 256 -c <<'HASHES'
d985ddd07dca08864a28337726f5b7d91b6426bebc7327f0e9b21cf9ff1cc937  .cache/clips/talknet.model
8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4  .cache/clips/face.onnx
HASHES
.cache/clips/venv/bin/python scripts/clips/faces.py --check
