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
    return heading + bars + `<div class="stat-total"><span>Total</span><strong>${total}</strong></div><p class="detail-note">Base values; in-game stats vary with level and training.</p>`;
}
