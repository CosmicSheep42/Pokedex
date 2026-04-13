export function renderBasic(data, name, id, speciesData) {
    const englishGenus = speciesData.genera?.find(g => g.language.name === 'en');

    const defaultSprite = data.sprites.front_default || '';
    const shinySprite = data.sprites.front_shiny || '';

    const typesHtml = data.types.map(t => {
        const typeName = t.type.name;
        const typeNameCapitalized = typeName.charAt(0).toUpperCase() + typeName.slice(1);

        return `
            <div class="type-icon-wrapper">
                <img
                    src="styles/types/${typeNameCapitalized}.png"
                    alt="${typeName}"
                    title="${typeName.toUpperCase()}"
                    class="type-icon"
                >
            </div>
        `;
    }).join('');

    return `
        <div class="pokemon-header">
            <div class="pokemon-name">
                ${name}
            </div>
            <div class="divider"></div>
            <div class="pokemon-subtitle">
                ${englishGenus?.genus || 'N/A'}
            </div>
        </div>

        <div class="info-sprite-row">
            <div class="info-column">
                <div class="info-card">
                    <div class="info-item">
                        <span class="info-label">ID</span>
                        <span class="info-value">#${String(id).padStart(4, '0')}</span>
                    </div>

                    <div class="info-item">
                        <span class="info-label">Height</span>
                        <span class="info-value">${(data.height / 10).toFixed(1)} m</span>
                    </div>

                    <div class="info-item">
                        <span class="info-label">Weight</span>
                        <span class="info-value">${(data.weight / 10).toFixed(1)} kg</span>
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
                    src="${defaultSprite}"
                    alt="${name} sprite"
                >
                <button
                    id="toggleSpriteBtn"
                    class="sprite-button"
                    data-default="${defaultSprite}"
                    data-shiny="${shinySprite}"
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

    const newToggleBtn = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newToggleBtn, toggleBtn);

    newToggleBtn.addEventListener('click', () => {
        isShiny = !isShiny;

        if (isShiny && shinySrc) {
            img.src = shinySrc;
            newToggleBtn.innerHTML = 'Shiny';
        } else {
            img.src = defaultSrc;
            newToggleBtn.innerHTML = 'Normal';
        }
    });
}
