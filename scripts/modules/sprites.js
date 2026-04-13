export function renderSprites(data) {
    let spritesHtml = '<div class="divider" style="margin-top: -1rem;"></div><div class="section-title" style="margin-top: 1rem;">Sprite Gallery</div><div class="sprite-grid">';
    function extractSprites(obj, path = '') {
        if (!obj) return;
        for (let key in obj) {
            if (typeof obj[key] === 'string' && (obj[key].startsWith('http://') || obj[key].startsWith('https://'))) {
                spritesHtml += `
                    <div class="sprite-item">
                        <img src="${obj[key]}" alt="${path + key}" onerror="this.style.display='none'">
                        <div class="sprite-label">${path + key}</div>
                    </div>
                `;
            } else if (typeof obj[key] === 'object' && obj[key] !== null) {
                extractSprites(obj[key], path + key + ' / ');
            }
        }
    }
    extractSprites(data.sprites);
    spritesHtml += '</div>';
    return spritesHtml;
}
