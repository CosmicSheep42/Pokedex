import { escapeHtml, safeImageUrl } from '../UI/safeHtml.js';
import { readable } from './overview.js';

export function renderForms(pokemon, species) {
    const varieties = (species?.varieties || []).filter(entry => entry?.pokemon?.name);
    if (varieties.length < 2) return '<article class="result-card"><h2>Forms & varieties</h2><p>Only one known variety.</p></article>';
    return `<article class="result-card"><h2>Forms & varieties</h2><div class="variety-grid">${varieties.map(entry => {
        const id = entry.pokemon.url?.match(/\/pokemon\/(\d+)\/?$/)?.[1];
        const image = id ? safeImageUrl(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`) : '';
        return `<button type="button" class="variety-card" data-variety="${escapeHtml(entry.pokemon.name)}" aria-pressed="${entry.pokemon.name === pokemon.name}">${image ? `<img src="${image}" alt="" loading="lazy">` : ''}<span>${escapeHtml(readable(entry.pokemon.name))}</span>${entry.is_default ? '<small>Default</small>' : ''}</button>`;
    }).join('')}</div><p class="form-status" role="status"></p></article>`;
}

export function initForms(root, species, api, onChange) {
    const buttons = [...root.querySelectorAll('[data-variety]')];
    const status = root.querySelector('.form-status');
    buttons.forEach(button => button.addEventListener('click', async () => {
        if (button.getAttribute('aria-pressed') === 'true') return;
        buttons.forEach(item => { item.disabled = true; });
        status.textContent = 'Loading variety…';
        root.setAttribute('aria-busy', 'true');
        try {
            const pokemon = await api.getPokemon(button.dataset.variety);
            if (pokemon?.species?.name !== species?.name || pokemon?.name !== button.dataset.variety) throw new Error('Unexpected variety');
            if (!root.isConnected) return;
            onChange(pokemon, button.dataset.variety);
        } catch {
            status.textContent = 'This variety could not be loaded. Select it again to retry.';
        } finally {
            root.removeAttribute('aria-busy');
            buttons.forEach(item => { item.disabled = false; });
        }
    }));
}
