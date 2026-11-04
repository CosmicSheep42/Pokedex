# Dataset provenance and image rights

## Primary source

- **WTP-Bench:** https://github.com/eternal-f1ame/WTP-Bench
- **Author:** Aaditya Baranwal (University of Central Florida / CRCV)
- **Revision used:** `5e96847cbabb1da6e28d85bae672f8f4e247322e`
- **Metadata:** `data/metadata.csv` (label, base species, generation, form, and path)
- **Images:** `data/images/hq/` (official artwork) and `data/images/silhouette/` (silhouettes)
- **Original scope:** about 1,160 Pokémon/form images from Generations 1–8, National Pokédex IDs 1–905; it does not cover Generation 9 or all 1,025 species.
- **Default sample:** 12 base-species images per generation, seed 42, 96 images total.

## Software and image rights

WTP-Bench identifies its project license as Apache 2.0, while Pokémon characters and artwork belong to their respective rights holders (Nintendo, Creatures, GAME FREAK, and The Pokémon Company). **A software license does not grant permission to redistribute the artwork.** The official Pokémon support page discourages unauthorized use of its materials:

https://support.pokemon.com/hc/en-us/articles/360000634094-Can-I-use-Pok%C3%A9mon-images-or-materials

This repository includes benchmark code, documentation, metadata, and aggregate results, but not official images. The downloader retrieves images locally from the source. Use and redistribution remain subject to the rights holders and source terms. Do not commit `dataset/images` to GitHub or assume that the entire dataset is covered by Apache 2.0.

For a public portfolio, prefer publishing aggregate metrics, code, and source links rather than image copies.

## Bias and validity

1. The model was already trained on Pokémon images. Official artwork may overlap its training data; without the original training set, this benchmark must not be described as held-out.
2. The dataset covers Generations 1–8, not Generation 9 or all 1,025 model classes.
3. Each base species has generally one image, with little variation in context, lighting, or photography. Measured accuracy does not automatically generalize to real photographs.
4. Silhouettes and transformed images derive from the same artwork and are dependent samples, not independent new examples.
5. The main score measures base-species correctness, not alternate-form correctness. Evaluating forms requires explicit form classes and compatible model labels.
6. This project did not train or fine-tune the third-party ViT model.

## Other sources considered

- **The Complete Pokédex Dataset:** https://github.com/cristobalmitchell/pokedex (covers 1,025 species with illustrations; the same copyright and leakage concerns apply).
- **PokeFA (metadata and fanart URLs):** https://huggingface.co/datasets/Kev0208/PokeFA-pokemon-fanart-captioned (metadata does not grant image rights; labels need review before evaluation).

For images with explicit permission, use `import-local` and document permissions, labels, and training-data separation.
