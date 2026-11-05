import { escapeHtml } from './safeHtml.js';

const chevron = '<svg class="dropdown-chevron" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 8l5 5 5-5"/></svg>';
let counter = 0;

// Custom listbox (replaces native <select>). options: [{ value, label, hint? }]
export function renderDropdown({ label, options, selected = options[0]?.value }) {
    const id = `dropdown-${++counter}`;
    const current = options.find(option => option.value === selected) || options[0];
    return `<div class="dropdown" data-dropdown>
        <button type="button" class="dropdown-trigger" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}" aria-label="${escapeHtml(label)}"><span class="dropdown-value">${escapeHtml(current.label)}</span>${chevron}</button>
        <ul class="dropdown-menu" id="${id}" role="listbox" tabindex="-1" aria-label="${escapeHtml(label)}" hidden>${options.map(option => `<li role="option" tabindex="-1" data-value="${escapeHtml(option.value)}" aria-selected="${option === current}"><span>${escapeHtml(option.label)}</span>${option.hint ? `<small>${escapeHtml(option.hint)}</small>` : ''}</li>`).join('')}</ul>
    </div>`;
}

export function initDropdown(root, onChange) {
    const trigger = root.querySelector('.dropdown-trigger');
    const menu = root.querySelector('.dropdown-menu');
    const items = [...menu.querySelectorAll('[role="option"]')];
    const label = trigger.querySelector('.dropdown-value');
    const isOpen = () => !menu.hidden;
    function open() {
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        const selected = items.find(item => item.getAttribute('aria-selected') === 'true') || items[0];
        selected.focus({ preventScroll: true });
        selected.scrollIntoView({ block: 'nearest' });
        menu.scrollIntoView({ block: 'nearest' });
    }
    function close(returnFocus = true) {
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        if (returnFocus) trigger.focus({ preventScroll: true });
    }
    function choose(item) {
        items.forEach(other => other.setAttribute('aria-selected', String(other === item)));
        label.textContent = item.querySelector('span').textContent;
        close();
        onChange(item.dataset.value, label.textContent);
    }
    trigger.addEventListener('click', () => isOpen() ? close() : open());
    trigger.addEventListener('keydown', event => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); open(); }
    });
    menu.addEventListener('click', event => { const item = event.target.closest('[role="option"]'); if (item) choose(item); });
    menu.addEventListener('keydown', event => {
        const index = items.indexOf(document.activeElement);
        const move = next => { event.preventDefault(); items[(next + items.length) % items.length].focus({ preventScroll: false }); };
        if (event.key === 'ArrowDown') move(index + 1);
        else if (event.key === 'ArrowUp') move(index - 1);
        else if (event.key === 'Home') move(0);
        else if (event.key === 'End') move(items.length - 1);
        else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (index >= 0) choose(items[index]); }
        else if (event.key === 'Escape') { event.preventDefault(); close(); }
        else if (event.key === 'Tab') close(false);
    });
    root.addEventListener('focusout', event => { if (isOpen() && !root.contains(event.relatedTarget)) close(false); });
    document.addEventListener('pointerdown', event => { if (isOpen() && root.isConnected && !root.contains(event.target)) close(false); });
}
