import { escapeHtml, safeImageUrl } from '../UI/safeHtml.js';
import { factRows, readable, numeric } from './overview.js';

export function renderBiology(species) {
    const gender = species?.gender_rate;
    const genderValid = Number.isInteger(gender) && gender >= 0 && gender <= 8;
    const eggs = (species?.egg_groups || []).filter(group => group?.name).map(group => `<span class="ability-chip">${escapeHtml(readable(group.name))}</span>`).join('');
    const facts = factRows([
        ['Hatch cycles', numeric(species?.hatch_counter)],
        ['Evolves from', readable(species?.evolves_from_species?.name)],
        ['Habitat', readable(species?.habitat?.name)], ['Shape', readable(species?.shape?.name)],
        ['Color', readable(species?.color?.name)], ['Growth rate', readable(species?.growth_rate?.name)],
        ['Classification', [species?.is_legendary && 'Legendary', species?.is_mythical && 'Mythical', species?.is_baby && 'Baby'].filter(Boolean).join(' · ')]
    ]);
    return `<article class="result-card"><h2>Biology</h2>${eggs ? `<h3>Egg groups</h3><div class="chip-list">${eggs}</div>` : ''}
        ${gender === -1 ? '<h3>Gender ratio</h3><p>Genderless</p>' : genderValid ? `<h3>Gender ratio</h3><p class="gender-label">${100 - gender * 12.5}% male <span>${gender * 12.5}% female</span></p><div class="gender-bar" aria-hidden="true"><span style="width:${100 - gender * 12.5}%"></span></div>` : ''}
        ${facts || (!eggs && gender !== -1 && !genderValid ? '<p>Biology data unavailable.</p>' : '')}</article>
        ${species?.evolution_chain?.url ? '<article class="result-card"><h2>Evolution</h2><div id="evolutionContent" aria-live="polite"></div></article>' : ''}`;
}

export function evolutionConditions(details = []) {
    // Show supported conditions only; the API can include additional game-specific requirements.
    return [...new Set(details.map(detail => {
        const parts = [];
        for (const [key, label] of [['min_level', 'Level'], ['min_happiness', 'Friendship'], ['min_affection', 'Affection'], ['min_beauty', 'Beauty']]) {
            if (numeric(detail[key]) !== null) parts.push(`${label} ${detail[key]}+`);
        }
        for (const [key, label] of [['item', 'Use'], ['held_item', 'Hold'], ['known_move', 'Move'], ['known_move_type', 'Move type'], ['location', 'At'], ['party_species', 'Party'], ['party_type', 'Party type'], ['trade_species', 'Trade for']]) {
            if (detail[key]?.name) parts.push(`${label}: ${readable(detail[key].name)}`);
        }
        if (detail.time_of_day) parts.push(readable(detail.time_of_day));
        if (detail.gender === 1 || detail.gender === 2) parts.push(detail.gender === 1 ? 'Female' : 'Male');
        if (detail.needs_overworld_rain) parts.push('Rain');
        if (detail.turn_upside_down) parts.push('Device upside down');
        if ([-1, 0, 1].includes(detail.relative_physical_stats)) parts.push(['Attack < Defense', 'Attack = Defense', 'Attack > Defense'][detail.relative_physical_stats + 1]);
        // The trigger is only informative when no other condition already explains it.
        if (detail.trigger?.name && (!parts.length || detail.trigger.name === 'trade')) parts.unshift(readable(detail.trigger.name));
        return parts.join(' · ');
    }).filter(Boolean))].join(' / ');
}

export function renderEvolution(chain, currentName = '') {
    if (!chain?.species?.name) return '<p>Evolution data unavailable.</p>';
    function node(item, isRoot = false) {
        const id = item.species?.url?.match(/\/pokemon-species\/(\d+)\/?$/)?.[1];
        const image = id ? safeImageUrl(`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`) : '';
        const conditions = evolutionConditions(item.evolution_details);
        const link = isRoot ? '' : `<div class="evo-link"><svg class="evo-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3v12M5 10l5 5 5-5"/></svg>${conditions ? `<span class="evo-cond">${escapeHtml(conditions)}</span>` : ''}</div>`;
        const children = item.evolves_to?.length ? `<ul class="evo-branch${item.evolves_to.length > 1 ? ' is-split' : ''}">${item.evolves_to.map(child => node(child)).join('')}</ul>` : '';
        return `<li class="evo-node">${link}<button type="button" class="evo-card" data-species="${escapeHtml(item.species?.name)}" aria-pressed="${item.species?.name === currentName}"><span class="evo-img">${image ? `<img src="${image}" alt="" loading="lazy">` : ''}</span><span class="evo-name">${escapeHtml(readable(item.species?.name))}</span>${id ? `<span class="evo-id">#${String(id).padStart(4, '0')}</span>` : ''}</button>${children}</li>`;
    }
    return `<ul class="evo-tree">${node(chain, true)}</ul><p class="form-status" role="status"></p>`;
}

export function initEvolution(root, species, api, onSelect) {
    const target = root.querySelector('#evolutionContent');
    if (!target || target.dataset.loaded) return;
    async function load() {
        target.dataset.loaded = 'true';
        target.textContent = 'Loading evolution…';
        try {
            const data = await api.getEvolutionChain(species.evolution_chain.url);
            target.innerHTML = renderEvolution(data.chain, species.name);
            const cards = [...target.querySelectorAll('[data-species]')];
            const status = target.querySelector('.form-status');
            cards.forEach(card => card.addEventListener('click', async () => {
                if (card.getAttribute('aria-pressed') === 'true' || !onSelect) return;
                cards.forEach(item => { item.disabled = true; });
                status.textContent = 'Loading Pokémon…';
                try {
                    await onSelect(card.dataset.species);
                } catch {
                    if (!target.isConnected) return;
                    status.textContent = 'This Pokémon could not be loaded. Select it again to retry.';
                    cards.forEach(item => { item.disabled = false; });
                }
            }));
        } catch {
            target.innerHTML = '<p>Evolution could not be loaded.</p><button type="button" class="secondary-button">Try again</button>';
            target.querySelector('button').addEventListener('click', load);
        }
    }
    load();
}
