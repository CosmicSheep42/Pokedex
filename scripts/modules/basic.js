import { escapeHtml, safeImageUrl } from '../UI/safeHtml.js';
import { typeColors, typeTheme } from '../UI/colors.js?v=2';

export function artworkSources(data, shiny = false) {
    const key = shiny ? 'front_shiny' : 'front_default';
    return [...new Set([data.sprites?.other?.['official-artwork']?.[key], data.sprites?.other?.home?.[key], data.sprites?.[key]]
        .filter(value => safeImageUrl(value)))];
}

export function renderBasic(data, name, id, species) {
    const genus = species?.genera?.find(g => g?.language?.name === 'en')?.genus;
    const normal = artworkSources(data);
    const shiny = artworkSources(data, true);
    const types = (data.types || []).filter(t => typeColors[t?.type?.name]).map(t => {
        const type = t.type.name;
        const theme = typeTheme(type);
        return `<span class="type-badge" style="color:${theme.strong};background:${theme.light}"><img src="styles/types/${type[0].toUpperCase() + type.slice(1)}.png" alt="" aria-hidden="true">${escapeHtml(type)}</span>`;
    }).join('');
    return `<header class="pokemon-hero">
        <div class="identity-line"><span class="national-number">#${escapeHtml(String(species?.id ?? id ?? '—').padStart(4, '0'))}</span><span class="types-badges">${types}</span></div>
        <h1 class="pokemon-name">${escapeHtml(name.replace(/-/g, ' '))}</h1>
        ${genus ? `<p class="pokemon-subtitle">${escapeHtml(genus)}</p>` : ''}
        <div class="artwork-stage"><div class="artwork-orbit" aria-hidden="true"></div><img id="pokemonSprite" ${normal[0] ? `src="${safeImageUrl(normal[0])}"` : 'hidden'} alt="${escapeHtml(name)} official artwork"><p class="artwork-unavailable" ${normal.length ? 'hidden' : ''}>Artwork unavailable</p></div>
        <div class="shiny-control" role="group" aria-label="Artwork variant"><button type="button" data-artwork="normal" aria-pressed="true">Normal</button><button type="button" data-artwork="shiny" aria-pressed="false" ${shiny.length ? '' : 'disabled'}>Shiny</button></div>
        <dl class="measurements">${[['Height', data.height, 'm'], ['Weight', data.weight, 'kg']].filter(([, value]) => Number.isFinite(value)).map(([label, value, unit]) => `<div><dt>${label}</dt><dd>${(value / 10).toFixed(1)} <span>${unit}</span></dd></div>`).join('')}</dl>
    </header>`;
}

export function initSpriteToggle(data, root = document) {
    const img = root.querySelector('#pokemonSprite');
    const buttons = [...root.querySelectorAll('[data-artwork]')];
    if (!img) return;
    let sources = artworkSources(data);
    let index = 0;
    const unavailable = root.querySelector('.artwork-unavailable');
    img.addEventListener('error', () => {
        if (++index < sources.length) img.src = sources[index];
        else { img.hidden = true; unavailable.hidden = false; }
    });
    img.addEventListener('load', () => { img.hidden = false; unavailable.hidden = true; img.classList.add('artwork-ready'); });
    buttons.forEach(button => button.addEventListener('click', () => {
        sources = artworkSources(data, button.dataset.artwork === 'shiny');
        if (!sources.length) return;
        index = 0;
        buttons.forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        img.alt = `${data.name} ${button.dataset.artwork} artwork`;
        img.classList.remove('artwork-ready');
        img.src = sources[0];
        img.hidden = false;
        unavailable.hidden = true;
    }));
}
