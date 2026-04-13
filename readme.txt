# Pokédex

A web application that identifies Pokémon from pictures using machine learning. Upload a picture with any Pokémon, and the backend classifies it using a Vision Transformer model, then fetches detailed data from PokeAPI.

---

## Live Demo

https://cosmicsheep42.github.io/Pokedex/

---

## How It Works

1. User uploads an image of a Pokémon  
2. Frontend sends the image to the backend API (hosted on Render)  
3. Backend uses a fine-tuned ViT model to classify the Pokémon (Gen 1–9, 1025 species)  
4. Frontend fetches detailed data from PokeAPI  
5. Information is displayed in a vertical carousel with stats, sprites, and flavor text  

---

## Tech Stack

### Frontend (GitHub Pages)

- Vanilla HTML, CSS, JavaScript  
- Modular architecture
- PokeAPI for Pokémon data  

### Backend (Render)

- Python + FastAPI  
- Hugging Face Transformers

---

## Full Local Setup (Frontend + Backend)

#### Backend

```bash
git clone 
cd pokemon/backend
pip install -r requirements.txt
uvicorn app:app --reload
```

#### Frontend

- Update `config.js` to point to `http://localhost:8000/classify`  
- Serve frontend with any static server  

---

## Project Structure

```text
Pokedex/
├── index.html              # Main entry point
├── scripts/
│   ├── core/               # API clients, classification, errors
│   ├── modules/            # Each component of the carousel
│   ├── ui/                 # Carousel, colors, result rendering
│   ├── main.js             # App initialization
├── config.js               # API URLs and timeouts
├── imports.css             # Imports all the css files in just one place
└── styles/                 # Component-specific CSS

Backend/
├── app.py                  # FastAPI server
└── requirements.txt        # Python dependencies
```

---

## Credits

- Pokémon data: PokeAPI  
- Classification model: skshmjn/Pokemon-classifier-gen9-1025
- Type icons: Official Pokémon assets

---

## License

MIT