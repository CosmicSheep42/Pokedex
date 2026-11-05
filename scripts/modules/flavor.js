import { escapeHtml } from "../UI/safeHtml.js";

export function renderFlavorText(speciesData) {
    if (!speciesData) return '<div class="flavor-section">No description available.</div>';
    
    const englishFlavor = (Array.isArray(speciesData.flavor_text_entries) ? speciesData.flavor_text_entries : [])
        .filter(entry => entry?.language?.name === 'en')
        ?.pop();
    
    if (typeof englishFlavor?.flavor_text !== 'string') return '<div class="flavor-section">No description available.</div>';
    
    const cleanText = englishFlavor.flavor_text
        .replace(/\f/g, ' ')
        .replace(/\n/g, ' ')
        .replace(/\r/g, ' ')
        .replace(/\s+/g, ' ');
    
        return `
        <div class="flavor-section">
                ${escapeHtml(cleanText)}
            ${typeof englishFlavor.version?.name === 'string' ? `<span class="flavor-source">Pokédex entry · ${escapeHtml(englishFlavor.version.name.replace(/-/g, ' '))}</span>` : ''}
        </div>
    `;
}   
