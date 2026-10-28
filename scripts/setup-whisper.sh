#!/usr/bin/env bash
# Builds the whisper.cpp engine and downloads the English base model used by
# Slate's offline dictation. Run this once before `npm run dist` in a fresh clone.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="$ROOT/resources/whisper"
VERSION="v1.7.6"
MODEL="ggml-base.en.bin"
MODEL_URL="https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODEL"

mkdir -p "$DEST"

if [[ ! -x "$DEST/whisper-cli" ]]; then
  echo "→ Building whisper.cpp $VERSION…"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  git clone --depth 1 --branch "$VERSION" https://github.com/ggml-org/whisper.cpp.git "$TMP/whisper.cpp"
  cmake -S "$TMP/whisper.cpp" -B "$TMP/whisper.cpp/build" \
    -DCMAKE_BUILD_TYPE=Release \
    -DBUILD_SHARED_LIBS=OFF \
    -DWHISPER_BUILD_TESTS=OFF \
    -DWHISPER_BUILD_EXAMPLES=ON \
    -DGGML_METAL=OFF \
    -DGGML_ACCELERATE=ON
  cmake --build "$TMP/whisper.cpp/build" --config Release -j "$(sysctl -n hw.ncpu 2>/dev/null || echo 4)"
  cp "$TMP/whisper.cpp/build/bin/whisper-cli" "$DEST/whisper-cli"
  chmod +x "$DEST/whisper-cli"
fi

if [[ ! -f "$DEST/$MODEL" ]]; then
  echo "→ Downloading $MODEL (about 140 MB)…"
  curl -L --fail --retry 3 -o "$DEST/$MODEL" "$MODEL_URL"
fi

echo "✓ Whisper ready: $DEST"
