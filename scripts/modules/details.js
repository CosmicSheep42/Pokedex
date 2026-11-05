import { escapeHtml } from "../UI/safeHtml.js";

export function renderDetails(pokemon, species) {
    const readable = value => typeof value === 'string' && value ? value.replace(/[-_]/g, ' ') : null;
    const numeric = value => Number.isFinite(value) && value >= 0 ? String(value) : null;
    const abilities = (Array.isArray(pokemon.abilities) ? pokemon.abilities : [])
        .filter(entry => typeof entry?.ability?.name === 'string')
        .map(entry => readable(entry.ability.name) + (entry.is_hidden ? ' (hidden)' : '')).join(', ');
    const eggs = (Array.isArray(species?.egg_groups) ? species.egg_groups : [])
        .map(group => readable(group?.name)).filter(Boolean).join(', ');
    const gender = species?.gender_rate;
    const genderText = gender === -1 ? 'Genderless' : Number.isInteger(gender) && gender >= 0 && gender <= 8
        ? `${gender * 12.5}% female / ${100 - gender * 12.5}% male` : null;
    const rows = entries => {
        const available = entries.filter(([, value]) => value !== null && value !== undefined && value !== '');
        return available.length ? `<dl class="pokemon-details">${available.map(([label, value]) => `<div><dt>${label}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>` : '';
    };
    const profile = rows([
        ['Abilities', abilities],
        ['Generation', readable(species?.generation?.name)?.replace(/^generation /, '').toUpperCase()],
        ['Category', species?.is_mythical === true ? 'Mythical' : species?.is_legendary === true ? 'Legendary' : species?.is_baby === true ? 'Baby Pokémon' : null],
        ['Habitat', readable(species?.habitat?.name)],
        ['Evolves from', readable(species?.evolves_from_species?.name)]
    ]);
    const training = rows([
        ['Base experience', numeric(pokemon.base_experience)],
        ['Growth rate', readable(species?.growth_rate?.name)],
        ['Base friendship', numeric(species?.base_happiness)],
        ['Capture rate', numeric(species?.capture_rate) === null ? null : `${species.capture_rate} / 255`]
    ]);
    const breeding = rows([
        ['Egg groups', eggs], ['Gender ratio', genderText], ['Hatch cycles', numeric(species?.hatch_counter)]
    ]);
    const varieties = (Array.isArray(species?.varieties) ? species.varieties : [])
        .filter(entry => typeof entry?.pokemon?.name === 'string');
    const forms = varieties.length > 1 ? `<ul class="variety-list">${varieties.map(entry => `<li>${escapeHtml(readable(entry.pokemon.name))}${entry.is_default ? ' <span class="detail-note">(default)</span>' : ''}</li>`).join('')}</ul>` : '';
    const panels = [
        ['Training', training], ['Breeding', breeding], ['Varieties', forms]
    ].filter(([, content]) => content).map(([title, content]) => `<details class="detail-group"><summary>${title}</summary>${content}</details>`).join('');
    if (!profile && !panels) return '';
    return `<h2 class="section-title">Pokémon Details</h2>${profile}${panels}`;
}
