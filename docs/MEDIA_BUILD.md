# Rebuild the beginner media

The public tutorial uses the current shared renderer in a separate temporary Electron profile. It does not record the user’s desktop or copy their app state. The first-install view and teaching requests are explicitly labelled illustrations. No AI inference or real runtime/model download is performed. File saves and the two-test command run against a disposable copy of `docs/tutorial-project`.

The checked guide was produced on macOS with an already-running local Ollama, Node/Electron, Python 3.9–3.12, Pillow, imageio-ffmpeg, ReportLab, and the installed Samantha system voice. These are documentation-production dependencies, not requirements for CyMalika users. Python 3 is used for the optional example’s tests.

From the repository root:

```sh
npm ci
npm run bundle
node scripts/capture-guide.cjs
python3 scripts/render-guide.py
npx prettier --write docs/media/TRANSCRIPT.md
python3 scripts/make-handbook.py
python3 scripts/package-guide.py
```

Use a Python environment containing the listed libraries. `render-guide.py` uses macOS `say` for narration and imageio-ffmpeg’s encoder. Do not publish an old PDF after changing the walkthrough: rebuild the PDF and bundle after the text/screenshots are final.

The capture manifest is written outside the repository, in `../guide-production-060/manifest.json`. It records the version, capture provenance, zero model/runtime downloads, the verified save and actual test result. Intermediate clips, narration audio and raw captures stay outside the public repository.

Before publishing:

1. Decode representative frames from the final MP4 and inspect the dialog edges, captions and labels. Check H.264/AAC playback, duration and audible narration.
2. Inspect the GIF and every PDF page. Avoid orphaned text pages, clipped tables and unreadable captions.
3. Check relative Markdown links, ZIP contents/CRC, subtitle timestamps and the absence of private content.
4. Push the docs and media to GitHub. Add the video, GIF, handbook and getting-started bundle to the current release, updating its SHA256SUMS entries while leaving application installers unchanged.

Future verified releases include these guide assets through `publish-desktop.yml`. The video visibly names the interface version used for its captures; regenerate the guide when changed controls make it inaccurate.
