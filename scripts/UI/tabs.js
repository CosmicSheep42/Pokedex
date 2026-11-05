export const resultTabs = ['Overview', 'Stats', 'Biology', 'Forms', 'Sprites'];

export function renderTabs() {
    return `<nav class="result-tabs" role="tablist" aria-label="Pokémon information">${resultTabs.map((label, i) => `<button type="button" role="tab" id="tab-${label.toLowerCase()}" aria-controls="panel-${label.toLowerCase()}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${label}</button>`).join('')}</nav>`;
}

export function initTabs(root, onSelect) {
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    function select(tab, scroll = true) {
        tabs.forEach(item => {
            const active = item === tab;
            item.setAttribute('aria-selected', String(active));
            item.tabIndex = active ? 0 : -1;
            root.querySelector(`#${item.getAttribute('aria-controls')}`).hidden = !active;
        });
        onSelect(tab.id.replace('tab-', ''));
        if (scroll) {
            root.scrollTop = root.querySelector('.result-hero-host').offsetHeight;
            tab.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        }
    }
    tabs.forEach((tab, index) => {
        tab.addEventListener('click', () => select(tab));
        tab.addEventListener('keydown', event => {
            let next;
            if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
            if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
            if (event.key === 'Home') next = 0;
            if (event.key === 'End') next = tabs.length - 1;
            if (next === undefined) return;
            event.preventDefault();
            tabs[next].focus({ preventScroll: true });
            select(tabs[next]);
        });
    });
}
