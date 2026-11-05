import { escapeHtml } from "../UI/safeHtml.js";

export function renderStats(data) {
    const heading = '<h2 class="section-title">Base Stats</h2>';
    if (!Array.isArray(data.stats) || !data.stats.length) return heading + '<p>No stats available.</p>';
    const labels = { hp: 'HP', attack: 'Attack', defense: 'Defense', 'special-attack': 'Sp. Atk', 'special-defense': 'Sp. Def', speed: 'Speed' };
    let total = 0;
    const bars = data.stats.map(s => {
        const stat = Number.isFinite(s?.base_stat) ? Math.max(0, s.base_stat) : 0;
        total += stat;
        const percent = Math.min(100, (stat / 255) * 100);
        const name = s?.stat?.name || 'Unknown';
        return `<div class="stat-bar"><span class="stat-name">${escapeHtml(labels[name] || name)}</span><span class="stat-value">${stat}</span><div class="stat-bar-bg" aria-hidden="true"><div class="stat-bar-fill" style="width: ${percent}%"></div></div></div>`;
    }).join('');
    return `<article class="result-card"><div class="stats-heading">${heading}<span class="stat-total">Total <strong>${total}</strong></span></div>${bars}<p class="detail-note">In-game stats vary with level and training.</p></article>` + renderRadar(data);
}


export function statProfile(values) {
    const [hp, attack, defense, specialAttack, specialDefense, speed] = values;
    const offense = (attack + specialAttack) / 2;
    const protection = (defense + specialDefense) / 2;
    const average = values.reduce((sum, value) => sum + value, 0) / 6;
    if (speed > Math.max(offense, protection, hp) * 1.2) return 'Speed-oriented';
    if (offense > protection * 1.2) return 'Offensive';
    if (protection > offense * 1.2) return 'Defensive';
    return Math.max(...values) <= average * 1.3 ? 'Balanced' : 'Mixed';
}

function renderRadar(data) {
    const keys = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'];
    const labels = ['HP', 'Attack', 'Defense', 'Sp. Atk', 'Sp. Def', 'Speed'];
    const values = keys.map(key => data.stats.find(stat => stat?.stat?.name === key)?.base_stat);
    if (!values.every(value => Number.isFinite(value) && value >= 0)) return '';
    const point = (index, radius) => [150 + Math.sin(index * Math.PI / 3) * radius, 120 - Math.cos(index * Math.PI / 3) * radius];
    const points = values => values.map((value, index) => point(index, value).join(',')).join(' ');
    const grid = [0.25, 0.5, 0.75, 1].map(scale => `<polygon points="${points(keys.map(() => 80 * scale))}"/>`).join('');
    return `<article class="result-card"><h2>Attribute profile</h2><svg class="stat-radar" viewBox="0 0 300 245" role="img" aria-label="Base stats radar, scale zero to 255. Values listed above.">
        <g class="radar-grid">${grid}${keys.map((_, index) => `<line x1="150" y1="120" x2="${point(index, 80)[0]}" y2="${point(index, 80)[1]}"/>`).join('')}</g>
        <polygon class="radar-values" points="${points(values.map(value => Math.min(value, 255) / 255 * 80))}"/>
        ${labels.map((label, index) => `<text x="${point(index, 108)[0]}" y="${point(index, 108)[1] + 4}" text-anchor="middle">${label}</text>`).join('')}</svg>
        <p class="profile-label">${statProfile(values)}</p><p class="detail-note">A simple base-attribute comparison, not a competitive rating.</p></article>`;
}
