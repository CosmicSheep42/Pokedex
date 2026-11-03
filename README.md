# Pokédex

A small web app that identifies a Pokémon from an uploaded image. A FastAPI service runs a pre-existing image classification model; the static frontend then fetches species data from PokéAPI and presents it in a vertical Pokédex carousel.

## Demo

[Open the GitHub Pages frontend](https://cosmicsheep42.github.io/Pokedex/). Classification depends on a separate Hugging Face Space that may need time to wake after inactivity.

<!-- Add a screenshot or short GIF here after capturing one from the deployed app. -->

## Features

- Image upload with format and 10 MB size checks
- Pokémon prediction, description, types, base stats, and sprite gallery
- Normal and shiny sprite toggle when both images are available
- Keyboard accessible upload controls, responsive layout, and recoverable error messages

## Tech stack

- **Frontend:** HTML, CSS, JavaScript ES Modules; static hosting on GitHub Pages
- **Backend:** Python, FastAPI, Pillow, PyTorch, Hugging Face Transformers; Docker Space on Hugging Face
- **Model:** [`skshmjn/Pokemon-classifier-gen9-1025`](https://huggingface.co/skshmjn/Pokemon-classifier-gen9-1025), a ViT image classifier published by `skshmjn`
- **Data:** [PokéAPI](https://pokeapi.co/) for Pokémon and species information

## Architecture

```text
Image → FastAPI /classify → ViT prediction → Pokémon name
     → PokéAPI /pokemon/{name} → /pokemon-species/{species}
     → Pokédex carousel
```

`main.js` owns UI state and upload events. `scripts/core/` handles requests, label normalization, and API contracts. `scripts/modules/` renders the existing slides. The backend validates and decodes the image before inference. The browser makes PokéAPI requests directly.

## Project structure

```text
index.html, imports.css, config.js    Static entry point, styles, API configuration
scripts/main.js                        UI coordination
scripts/core/                          HTTP, classification, PokéAPI, errors, names
scripts/modules/                       Upload and result slide renderers
scripts/UI/                            Carousel, drag scroll, colors, safe HTML
styles/                                Pokédex styles and type icons
tests/                                 Frontend tests using Node's test runner
backend/                               Hugging Face Space Git submodule
  app.py, Dockerfile, requirements.txt FastAPI inference service
  test_app.py, requirements-test.txt   API tests without downloading the model
.github/workflows/checks.yml          Frontend CI checks
```

## Local development

Clone with the backend submodule:

```bash
git clone --recurse-submodules https://github.com/CosmicSheep42/Pokedex.git
cd Pokedex
python3 -m http.server 5173
```

Open `http://localhost:5173`. The frontend uses the deployed backend by default. No Node install is needed to serve it; Node 20 or newer is needed for tests.

To run the backend locally, install its dependencies in a Python virtual environment, then start Uvicorn:

```bash
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app:app --host 127.0.0.1 --port 8000
```

Change `BACKEND_URL` in the root `config.js` to `http://127.0.0.1:8000/classify` while developing locally. The first backend start downloads and loads the model, so it needs internet access, RAM, and additional disk space. Restore the deployed URL before publishing the static frontend. Local development origins on ports 5173 and 5500 are listed in backend CORS settings.

## Machine learning

The backend integrates the existing model published by `skshmjn`; this project does not claim to have trained or fine-tuned it. The model card describes it as a ViT classifier for up to 1,025 Pokémon species. The service opens the uploaded image with Pillow, checks its dimensions, converts it to RGB, applies `ViTImageProcessor.from_pretrained`, and runs `ViTForImageClassification` in inference mode. It maps the highest logit to a label and returns `pokemonName` plus up to five candidates with `modelScore` values derived from softmax. These scores are **not calibrated probabilities**. The frontend currently uses only `pokemonName`.

The model may misclassify unusual artwork, partial subjects, multiple Pokémon, or images outside its training distribution. No separate labeled evaluation set, top-1/top-5 benchmark, calibration study, or error analysis is included, so no accuracy claim is made here. A reproducible evaluation would require a held-out labeled image set with documented source and label mapping.

## Testing

```bash
npm test
npm run verify
```

These commands use Node's built-in test runner, check the frontend entry point, and parse the backend source. Frontend tests mock network calls and cover normalization, HTTP errors, timeouts, classifier and PokéAPI contracts, upload validation, and optional rendering data. No build step is required.

Backend API tests use lightweight dependencies and stub inference, so they do not download the model:

```bash
python3 -m venv .venv-test
.venv-test/bin/pip install -r backend/requirements-test.txt
.venv-test/bin/python -m unittest discover -s backend -p 'test_*.py'
```

GitHub Actions runs `npm run verify` on pushes and pull requests. Backend tests should also run in CI after the separate backend submodule changes are published and its Git pointer is updated in this repository.

## Deployment

The frontend is hosted on GitHub Pages. The backend is a [Hugging Face Docker Space](https://huggingface.co/spaces/CosmicSheep42/backend), tracked here as a Git submodule. Changes inside `backend/` belong to that separate repository and require their own commit and deployment before the hosted API changes. A sleeping Space or cold model load can delay the first classification; the frontend waits up to 90 seconds and then shows a retryable message. Neither service is assumed to be continuously available.

## Credits and license

Pokémon data and sprite URLs: PokéAPI and its linked asset sources. Classifier: [`skshmjn/Pokemon-classifier-gen9-1025`](https://huggingface.co/skshmjn/Pokemon-classifier-gen9-1025) (Apache 2.0 model card). Bundled type icons are present in `styles/types/`; their original source and reuse terms are not documented in this repository and should be confirmed before broader redistribution. Project code: [MIT License](LICENSE).
