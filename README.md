# WorldSonus project website

The official project page is https://noizai.github.io/WorldSonus/.

This public repository contains the static website and presentation assets only.
Model weights: https://huggingface.co/FF2416/WorldSonus.
The model code remains in the separate `NoizAI/WorldSonus` repository.

## Publishing

GitHub Pages serves the repository root from the `main` branch, with `.nojekyll`.
The complete project page lives in `WorldSonus/`; update that directory for future
website changes. Videos are served from the existing public media storage.
The former `NoizAI/WorldSonus-demo` website redirects visitors to the new URL.

To preview locally, run `python3 -m http.server 8000` and open `/WorldSonus/`.
