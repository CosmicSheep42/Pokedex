import { escapeHtml, safeImageUrl } from "../UI/safeHtml.js";

export function renderSprites(data) {
    let spritesHtml = '<div class="divider" style="margin-top: -1rem;"></div><div class="section-title" style="margin-top: 1rem;">Sprite Gallery</div><div class="sprite-grid">';
    const seen = new Set();
    function extractSprites(obj, path = '') {
        if (!obj) return;
        for (const [key, value] of Object.entries(obj)) {
            const url = safeImageUrl(value);
            if (url && !seen.has(url)) {
                seen.add(url);
                const label = escapeHtml(path + key);
                spritesHtml += `
                    <div class="sprite-item">
                        <img src="${url}" alt="${label}" loading="lazy">
                        <div class="sprite-label">${label}</div>
                    </div>
                `;
            } else if (typeof value === 'object' && value !== null) {
                extractSprites(value, path + key + ' / ');
            }
        }
    }
    extractSprites(data.sprites);
    spritesHtml += seen.size ? '</div>' : '<p>No sprites available.</p></div>';
    return spritesHtml;
}
