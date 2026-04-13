export function renderStats(data) {
    let html = '<div class="section-title">Base Stats</div>';
    data.stats.forEach(s => {
        const percent = (s.base_stat / 255) * 100;
        html += `
            <div class="stat-bar">
                <span class="stat-name">${s.stat.name.toUpperCase()}:</span>
                <div class="stat-bar-bg">
                    <div class="stat-bar-fill" style="width: ${percent}%">${s.base_stat}</div>
                </div>
                </div>
        `;
    });
    return html;
}
