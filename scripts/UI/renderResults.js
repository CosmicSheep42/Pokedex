import { applyColor } from './colors.js?v=2';
import { renderTabs, initTabs, resultTabs } from './tabs.js';
import { renderBasic, initSpriteToggle } from '../modules/basic.js';
import { renderOverview, initOverview } from '../modules/overview.js';
import { renderStats } from '../modules/stats.js';
import { renderBiology, initEvolution } from '../modules/biology.js?v=3';
import { renderForms, initForms } from '../modules/forms.js';
import { renderSprites, initSpriteGallery } from '../modules/sprites.js';
import { APIService } from '../core/pokeAPI.js';
import { HttpClient } from '../core/httpClient.js';
import { CONFIG } from '../../config.js';

const defaultAPI = new APIService({ httpClient: new HttpClient(), baseUrl: CONFIG.POKEAPI.BASE_URL, timeoutMs: CONFIG.POKEAPI_TIMEOUT });

export function renderResult(fullData, api = defaultAPI, startTab = 'overview', focusSpecies = '') {
    const container = document.getElementById('carouselContainer');
    if (!container) return;
    let pokemon = fullData.pokemon;
    const species = fullData.species;
    container.classList.add('has-result');
    container.innerHTML = '<div class="result-hero-host"></div>' + renderTabs() + resultTabs.map((label, index) => `<section id="panel-${label.toLowerCase()}" class="result-panel" role="tabpanel" aria-labelledby="tab-${label.toLowerCase()}" tabindex="0" ${index ? 'hidden' : ''}></section>`).join('');
    const hero = container.querySelector('.result-hero-host');
    const panel = name => container.querySelector(`#panel-${name}`);
    let active = 'overview';
    const rendered = new Set();
    function show(name) {
        active = name;
        if (rendered.has(name)) return;
        const target = panel(name);
        const renderers = { overview: () => renderOverview(pokemon, species), stats: () => renderStats(pokemon), biology: () => renderBiology(species), forms: () => renderForms(pokemon, species), sprites: () => renderSprites(pokemon) };
        target.innerHTML = renderers[name]();
        rendered.add(name);
        if (name === 'overview') initOverview(target, species, api);
        if (name === 'biology') initEvolution(target, species, api, async name => {
            const next = await api.getSpecies(name);
            const variety = next?.varieties?.find(entry => entry.is_default)?.pokemon?.name || name;
            const nextPokemon = await api.getPokemon(variety);
            if (!container.isConnected) return;
            renderResult({ pokemon: nextPokemon, species: next, prediction: fullData.prediction }, api, 'biology', name);
        });
        if (name === 'sprites') initSpriteGallery(target);
        if (name === 'forms') initForms(target, species, api, (next, name) => {
            pokemon = next;
            updateHero();
            for (const key of ['overview', 'stats', 'forms', 'sprites']) { rendered.delete(key); panel(key).replaceChildren(); }
            show(active);
            const button = [...panel('forms').querySelectorAll('[data-variety]')].find(item => item.dataset.variety === name);
            button?.focus({ preventScroll: true });
        });
    }
    function updateHero() {
        applyColor(pokemon, container);
        hero.innerHTML = renderBasic(pokemon, species?.name || pokemon.name || fullData.prediction || 'Unknown', pokemon.id, species);
        initSpriteToggle(pokemon, hero);
    }
    if (!container.dataset.imageErrorInitialized) {
        container.addEventListener('error', event => {
            if (event.target instanceof HTMLImageElement && event.target.id !== 'pokemonSprite') {
                event.target.hidden = true;
                const card = event.target.closest('.sprite-item');
                if (card) {
                    card.disabled = true;
                    card.querySelector('.sprite-label').textContent = `${event.target.alt} · Image unavailable`;
                }
            }
        }, true);
        container.dataset.imageErrorInitialized = 'true';
    }
    updateHero();
    initTabs(container, show);
    show('overview');
    container.scrollTop = 0;
    if (startTab !== 'overview') {
        container.querySelector(`#tab-${startTab}`)?.click();
        if (focusSpecies) {
            const wait = () => container.querySelector(`[data-species="${CSS.escape(focusSpecies)}"]`)?.focus({ preventScroll: true });
            setTimeout(wait, 400);
        }
    }
}
