import { buildCarousel } from "./carousel.js";
import { renderBasic, initSpriteToggle } from "../modules/basic.js";
import { renderFlavorText } from "../modules/flavor.js";
import { renderStats } from "../modules/stats.js";
import { renderSprites, initSpriteGallery } from "../modules/sprites.js";
import { renderDetails } from "../modules/details.js";

const BG_COLOR = "#ffffff";

export function renderResult(fullData) {
    const pokemonData = fullData.pokemon;
    const speciesData = fullData.species || null;   
    const rawName = pokemonData.name || fullData.prediction || 'Unknown';
    const name = rawName.charAt(0).toUpperCase() + rawName.slice(1);
    const id = pokemonData.id;

    const slides = [
        { html: renderBasic(pokemonData, name, id, speciesData), bgColor: BG_COLOR, onRender: initSpriteToggle },
        { html: renderFlavorText(speciesData), bgColor: BG_COLOR },
        { html: renderStats(pokemonData), bgColor: BG_COLOR },
        { html: renderDetails(pokemonData, speciesData), bgColor: BG_COLOR },
        { html: renderSprites(pokemonData), bgColor: BG_COLOR, onRender: initSpriteGallery }
    ];

    buildCarousel(slides, pokemonData);
}
