# Dictation engine

Slate transcribes dictation fully offline with [whisper.cpp](https://github.com/ggml-org/whisper.cpp)
and OpenAI's Whisper `base.en` model.

These binaries are not committed to git (about 145 MB). Run:

```bash
npm run setup:whisper
```

before `npm run dist`, or the Dictation feature will report that the engine is unavailable.

- whisper.cpp — MIT License
- Whisper model — MIT License (OpenAI)
