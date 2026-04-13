export function renderFlavorText(speciesData) {
    if (!speciesData) return '';
    
    const englishFlavor = speciesData.flavor_text_entries
        ?.filter(entry => entry.language.name === 'en')
        ?.pop();
    
    if (!englishFlavor) return '';
    
    const cleanText = englishFlavor.flavor_text
        .replace(/\f/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\s+/g, ' ');
    
        return `
        <div class="flavor-section">
                ${cleanText}
            <div class="divider" style="margin-top: 1.25rem;"></div>
        </div>
    `;
}   
