import { escapeHtml } from "../UI/safeHtml.js";
import { formatName } from "../UI/format.js";
import { renderDropdown, initDropdown } from "../UI/dropdown.js";

const clean = text => text.replace(/[\f\n\r]/g, ' ').replace(/\s+/g, ' ').trim();

export function flavorEntries(speciesData) {
    return (Array.isArray(speciesData?.flavor_text_entries) ? speciesData.flavor_text_entries : [])
        .filter(entry => entry?.language?.name === 'en' && typeof entry.flavor_text === 'string' && entry.flavor_text.trim())
        .map(entry => ({ text: clean(entry.flavor_text), version: typeof entry.version?.name === 'string' ? entry.version.name : '' }));
}

export function renderFlavorText(speciesData) {
    const entries = flavorEntries(speciesData);
    if (!entries.length) return '<div class="flavor-section">No description available.</div>';
    const latest = entries[entries.length - 1];
    const versions = entries.filter(entry => entry.version);
    const picker = versions.length > 1
        ? `<div class="flavor-picker"><span class="picker-caption">Game</span>${renderDropdown({ label: 'Pokédex entry game', options: versions.map(entry => ({ value: entry.version, label: formatName(entry.version) })), selected: latest.version })}</div>`
        : (latest.version ? `<span class="flavor-source">Pokédex entry · ${escapeHtml(formatName(latest.version))}</span>` : '');
    return `<div class="flavor-section">${picker}<p class="flavor-text" aria-live="polite">${escapeHtml(latest.text)}</p></div>`;
}

export function initFlavor(root, speciesData) {
    const host = root.querySelector('.flavor-picker .dropdown');
    if (!host) return;
    const entries = flavorEntries(speciesData);
    const text = root.querySelector('.flavor-text');
    initDropdown(host, version => { const entry = entries.find(item => item.version === version); if (entry) text.textContent = entry.text; });
}
