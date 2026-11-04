import { escapeHtml, safeImageUrl } from "../UI/safeHtml.js";

const readable = value => value.replace(/[-_]/g, ' ');

export function renderSprites(data) {
    const sprites = data.sprites || {};
    const groups = [
        ['Main sprites', Object.fromEntries(Object.entries(sprites).filter(([key]) => key !== 'other' && key !== 'versions'))],
        ...Object.entries(sprites.other || {}),
        ...Object.entries(sprites.versions || {})
    ];
    const panels = groups.map(([title, source]) => {
        const seen = new Set();
        const items = [];
        function collect(obj, path = '') {
            if (!obj || typeof obj !== 'object') return;
            for (const [key, value] of Object.entries(obj)) {
                const url = safeImageUrl(value);
                if (url && !seen.has(url)) {
                    seen.add(url);
                    const label = escapeHtml(readable(path + key));
                    items.push(`<figure class="sprite-item"><img src="${url}" alt="${label}" loading="lazy"><figcaption class="sprite-label">${label}</figcaption></figure>`);
                } else if (value && typeof value === 'object') {
                    collect(value, path + key + ' / ');
                }
            }
        }
        collect(source);
        if (!items.length) return '';
        return `<details class="sprite-group"><summary>${escapeHtml(readable(title))} <span class="sprite-count">(${items.length})</span></summary><div class="sprite-grid">${items.join('')}</div></details>`;
    }).join('');
    return `<div class="divider"></div><h2 class="section-title">Sprite Gallery</h2>${panels ? '<p class="gallery-hint">Choose a collection to view its sprites.</p>' + panels : '<p>No sprites available.</p>'}`;
}
