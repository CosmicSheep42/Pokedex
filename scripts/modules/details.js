import { escapeHtml } from "../UI/safeHtml.js";

export function renderDetails(pokemon, species) {
    const readable = value => typeof value === 'string' && value ? value.replace(/[-_]/g, ' ') : null;
    const abilities = (Array.isArray(pokemon.abilities) ? pokemon.abilities : [])
        .filter(entry => entry?.ability?.name)
        .map(entry => readable(entry.ability.name) + (entry.is_hidden ? ' (hidden)' : '')).join(', ');
    const eggs = (Array.isArray(species?.egg_groups) ? species.egg_groups : [])
        .map(group => readable(group?.name)).filter(Boolean).join(', ');
    const rows = [
        ['Abilities', abilities],
        ['Generation', readable(species?.generation?.name)?.replace(/^generation /, '').toUpperCase()],
        ['Habitat', readable(species?.habitat?.name)],
        ['Egg groups', eggs],
        ['Growth rate', readable(species?.growth_rate?.name)]
    ].filter(([, value]) => value);
    if (!rows.length) return '';
    return `<div class="divider"></div><h2 class="section-title">Pokémon Details</h2><dl class="pokemon-details">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>`;
}
