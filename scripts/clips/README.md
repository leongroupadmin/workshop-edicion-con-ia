# Clips

Separate pipeline: `/clips` → `/api/clips` → `scripts/clips/worker.ts` → `src/clips/index.tsx`.
Data lives in `clips/c-<uuid>/`; Edit's projects, statuses, settings and Remotion entry point are never written.
Legacy `clips/` experiments are left untouched and are not listed as new jobs.

## Setup

Run `bash scripts/clips/setup.sh`. Dependencies live in `.cache/clips/venv`.
Requires Python 3.9+, FFmpeg, existing Whisper.cpp installation/model and Claude or Codex login.
The script installs pinned Python packages, the TalkNet source revision and public TalkSet/YuNet weights.
TalkNet uses CPU inference (two threads), so speaker analysis may take several minutes per clip.
No pyannote account is needed: TalkNet associates faces and speech directly through audiovisual inference.

## Processing

1. Validate audio/video, maximum 900 seconds; freeze brand and music into the job.
2. Transcribe without modifying Edit's project status. Select continuous, non-overlapping fragments by word indices.
3. Human reviews proposals and adjusts source boundaries (5–90 seconds, within configured range).
4. Extract selected fragments, remove pauses/fillers using the chosen cut preset, resync words. Retake removal is disabled to preserve the selected narrative; cleaning is skipped if it would violate the minimum duration.
5. YuNet detects faces at 5 Hz. IoU tracks associate detections within shots; TalkNet scores each face from the matching audio and 25 fps video. A precomputed framing timeline confirms speaker changes for 560 ms, holds shots for at least 1800 ms, and confirms overlap for 800 ms. Brief uncertainty holds the last framing. Hard source cuts and sustained face loss can reset it immediately. Every crop uses cover scaling: single portrait, or two full-width stacked slots for sustained overlap; never landscape letterboxing.
6. Render separate H.264/AAC 1080×1920 files through a dedicated Remotion entry point, with shared read-only caption/font components. Validate exported dimensions and duration.

Tracking is probabilistic, not a guarantee. Speech with over 5% of frames lacking any face stops that clip's export. Low-confidence speech retains the last stable vertical framing and surfaces a review warning. Off-camera speakers cannot be reconstructed. Review crops on real multi-speaker footage before relying on unattended batches.

Each export has a unique filename and JSON manifest with settings, cuts, face scores and word timings. Re-renders do not overwrite previous media. Public file route serves only the current source, current exports and their JPG posters. Jobs use PID locks; interrupted jobs can be retried after a server restart.

## Checks

`node --import tsx --test scripts/clips/clips.test.ts`

`npm --prefix app run test:e2e -- --config playwright.clips.config.ts clips.spec.ts clips-results.spec.ts new-video.spec.ts`

`node_modules/.bin/tsc --noEmit` and `app/node_modules/.bin/tsc --noEmit -p app`

## Reframe an existing export

`node --import tsx scripts/clips/reframe.ts <job-id> <clip-id>` reuses saved cuts, words and face scores, renders a new version with framing v2, and preserves the prior MP4. No transcription or cloud AI requests. Changed source boundaries require a full render instead.

Results UI: compact clip list, one active preview, separate Original view, active clip controls, persistent batch actions. Rendering one clip does not change the batch selection.
