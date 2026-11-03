import { escapeHtml, safeImageUrl } from "../UI/safeHtml.js";

export function renderBasic(data, name, id, speciesData) {
    const englishGenus = Array.isArray(speciesData?.genera)
        ? speciesData.genera.find(g => g?.language?.name === 'en') : null;

    const defaultSprite = safeImageUrl(data.sprites?.front_default);
    const shinySprite = safeImageUrl(data.sprites?.front_shiny);

    const typesHtml = (Array.isArray(data.types) ? data.types : []).map(t => {
        const typeName = t?.type?.name;
        if (!/^(normal|fire|water|electric|grass|ice|fighting|poison|ground|flying|psychic|bug|rock|ghost|dragon|dark|steel|fairy)$/.test(typeName)) return '';
        const typeNameCapitalized = typeName.charAt(0).toUpperCase() + typeName.slice(1);

        return `
            <div class="type-icon-wrapper">
                <img
                    src="styles/types/${typeNameCapitalized}.png"
                    alt="${typeName} type"
                    title="${typeName.toUpperCase()}"
                    class="type-icon"
                >
            </div>
        `;
    }).join('');

    return `
        <div class="pokemon-header">
            <div class="pokemon-name">
                ${escapeHtml(name)}
            </div>
            <div class="divider"></div>
            <div class="pokemon-subtitle">
                ${escapeHtml(englishGenus?.genus || 'N/A')}
            </div>
        </div>

        <div class="info-sprite-row">
            <div class="info-column">
                <div class="info-card">
                    <div class="info-item">
                        <span class="info-label">ID</span>
                        <span class="info-value">#${escapeHtml(String(id ?? 'N/A').padStart(4, '0'))}</span>
                    </div>

                    <div class="info-item">
                        <span class="info-label">Height</span>
                        <span class="info-value">${Number.isFinite(data.height) ? (data.height / 10).toFixed(1) + ' m' : 'N/A'}</span>
                    </div>

                    <div class="info-item">
                        <span class="info-label">Weight</span>
                        <span class="info-value">${Number.isFinite(data.weight) ? (data.weight / 10).toFixed(1) + ' kg' : 'N/A'}</span>
                    </div>

                    <div class="info-item info-item-types">
                        <span class="info-label">Types</span>
                        <div class="types-container-icons">
                            ${typesHtml}
                        </div>
                    </div>
                </div>
            </div>

            <div class="sprite-column">
                <img
                    id="pokemonSprite"
                    class="sprite-image"
                    ${defaultSprite ? `src="${defaultSprite}"` : ''}
                    alt="${escapeHtml(name)} sprite"
                    ${defaultSprite ? '' : 'hidden'}
                >
                <button
                    id="toggleSpriteBtn"
                    class="sprite-button"
                    data-default="${defaultSprite}"
                    data-shiny="${shinySprite}"
                    ${shinySprite && defaultSprite ? '' : 'disabled'}
                >
                    Normal
                </button>
            </div>
        </div>

    `;
}

export function initSpriteToggle() {
    const toggleBtn = document.getElementById('toggleSpriteBtn');
    if (!toggleBtn) return;

    const img = document.getElementById('pokemonSprite');
    const defaultSrc = toggleBtn.dataset.default;
    const shinySrc = toggleBtn.dataset.shiny;
    let isShiny = false;

    toggleBtn.addEventListener('click', () => {
        isShiny = !isShiny;

        if (isShiny && shinySrc) {
            img.src = shinySrc;
            toggleBtn.textContent = 'Shiny';
        } else {
            img.src = defaultSrc;
            toggleBtn.textContent = 'Normal';
        }
    });
    img.addEventListener('error', () => { img.hidden = true; });
    img.addEventListener('load', () => { img.hidden = false; });
}
