import { escapeHtml } from "../UI/safeHtml.js";

export function renderStats(data) {
    let html = '<div class="section-title">Base Stats</div>';
    if (!Array.isArray(data.stats) || !data.stats.length) return html + '<p>No stats available.</p>';
    data.stats.forEach(s => {
        const stat = Number.isFinite(s?.base_stat) ? Math.max(0, s.base_stat) : 0;
        const percent = Math.min(100, (stat / 255) * 100);
        html += `
            <div class="stat-bar">
                <span class="stat-name">${escapeHtml(String(s?.stat?.name || 'unknown').toUpperCase())}:</span>
                <div class="stat-bar-bg">
                    <div class="stat-bar-fill" style="width: ${percent}%">${stat}</div>
                </div>
                </div>
        `;
    });
    return html;
}
