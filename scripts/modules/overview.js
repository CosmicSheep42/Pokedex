import { escapeHtml } from '../UI/safeHtml.js';
import { renderFlavorText, initFlavor } from './flavor.js';
import { formatName } from '../UI/format.js';
export const readable = value => typeof value === 'string' ? value.replace(/[-_]/g, ' ') : '';
export const numeric = value => Number.isFinite(value) && value >= 0 ? value : null;
export function factRows(entries, className = 'biology-facts') {
    const rows = entries.filter(([, value]) => value !== null && value !== undefined && value !== '');
    return rows.length ? `<dl class="${className}">${rows.map(([label, value]) => `<div><dt><span class="fact-marker" aria-hidden="true"></span>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : '';
}
export function renderOverview(pokemon, species) {
    const facts = factRows([
        ['Generation', readable(species?.generation?.name).replace(/^generation /, '').toUpperCase()],
        ['Habitat', readable(species?.habitat?.name)],
        ['Capture rate', numeric(species?.capture_rate) === null ? null : `${species.capture_rate} / 255`],
        ['Growth rate', readable(species?.growth_rate?.name)],
        ['Base experience', numeric(pokemon.base_experience)],
        ['Base friendship', numeric(species?.base_happiness)]
    ], 'quick-facts');
    const abilities = (pokemon.abilities || []).filter(entry => entry?.ability?.name).map(entry => `<li class="ability-item" ${entry.ability.url ? `data-ability-url="${escapeHtml(entry.ability.url)}"` : ''}><div class="ability-head"><strong>${escapeHtml(formatName(entry.ability.name))}</strong>${entry.is_hidden ? '<small>Hidden</small>' : ''}</div><p class="ability-desc">${entry.ability.url ? 'Loading description…' : ''}</p></li>`).join('');
    return `<article class="result-card entry-card"><h2><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h7l1 2 1-2h7v16h-7l-1 1-1-1H4zM12 6v14"/></svg>Pokédex Entry</h2>${renderFlavorText(species)}</article>`
        + (facts ? `<article class="result-card"><h2>Quick Facts</h2>${facts}</article>` : '')
        + (abilities ? `<article class="result-card"><h2>Abilities</h2><ul class="ability-list">${abilities}</ul></article>` : '');
}

const abilityText = ability => {
    const effect = (ability?.effect_entries || []).find(entry => entry?.language?.name === 'en' && entry.short_effect);
    const flavor = [...(ability?.flavor_text_entries || [])].reverse().find(entry => entry?.language?.name === 'en' && entry.flavor_text);
    return (effect?.short_effect || flavor?.flavor_text || '').replace(/\s+/g, ' ').trim();
};

export function initOverview(root, species, api) {
    initFlavor(root, species);
    root.querySelectorAll('[data-ability-url]').forEach(async item => {
        const target = item.querySelector('.ability-desc');
        try {
            target.textContent = abilityText(await api.getAbility(item.dataset.abilityUrl)) || 'No description available.';
        } catch {
            target.textContent = 'Description unavailable.';
        }
    });
}
