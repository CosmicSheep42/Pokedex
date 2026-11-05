import { escapeHtml, safeImageUrl } from "../UI/safeHtml.js";
import { formatName } from "../UI/format.js";
import { renderDropdown, initDropdown } from "../UI/dropdown.js";

export function renderSprites(data) {
    const sprites = data.sprites || {};
    const groups = [
        ['Main sprites', Object.fromEntries(Object.entries(sprites).filter(([key]) => key !== 'other' && key !== 'versions'))],
        ...Object.entries(sprites.other || {}),
        ...Object.entries(sprites.versions || {})
    ];
    const collections = groups.map(([title, source]) => {
        const seen = new Set();
        const items = [];
        function collect(obj, path = '') {
            if (!obj || typeof obj !== 'object') return;
            for (const [key, value] of Object.entries(obj)) {
                const url = safeImageUrl(value);
                if (url && !seen.has(url)) {
                    seen.add(url);
                    const label = escapeHtml(formatName(path + key));
                    items.push(`<button type="button" class="sprite-item ${title.startsWith('generation-') || title === 'Main sprites' || title === 'showdown' ? 'pixel-art' : ''}" aria-label="Enlarge ${label}"><img src="${url}" alt="${label}" loading="lazy"><span class="sprite-label">${label}</span></button>`);
                } else if (value && typeof value === 'object') {
                    collect(value, path + key + ' / ');
                }
            }
        }
        collect(source);
        if (!items.length) return null;
        return { title: formatName(title), items };
    }).filter(Boolean);
    const heading = '<h2 class="section-title">Sprite Gallery</h2>';
    if (!collections.length) return heading + '<p>No sprites available.</p>';
    return '<article class="result-card">' + heading + `<div class="sprite-gallery">
        ${renderDropdown({ label: 'Sprite collection', options: collections.map((group, index) => ({ value: String(index), label: group.title, hint: String(group.items.length) })) })}
        <div id="spriteCollectionGrid" class="sprite-grid">${collections[0].items.join('')}</div>
        ${collections.map(group => `<template>${group.items.join('')}</template>`).join('')}
    </div><dialog class="sprite-viewer" aria-labelledby="spriteViewerTitle"><button type="button" class="viewer-close">Close</button><h2 id="spriteViewerTitle"></h2><img alt=""><p></p></dialog></article>`;
}

export function initSpriteGallery(root = document) {
    const gallery = root.querySelector('.sprite-gallery');
    if (!gallery) return;
    const picker = gallery.querySelector('.dropdown');
    const grid = gallery.querySelector('.sprite-grid');
    const templates = gallery.querySelectorAll('template');
    const dialog = root.querySelector('.sprite-viewer');
    let opener;
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => opener?.focus());
    grid.addEventListener('click', event => {
        const button = event.target.closest('.sprite-item');
        if (!button) return;
        opener = button;
        const image = button.querySelector('img');
        const enlarged = dialog.querySelector('img');
        enlarged.hidden = false;
        enlarged.src = image.src;
        enlarged.alt = image.alt;
        enlarged.classList.toggle('pixel-art', button.classList.contains('pixel-art'));
        dialog.querySelector('h2').textContent = picker.querySelector('.dropdown-value').textContent;
        dialog.querySelector('p').textContent = image.alt;
        dialog.showModal();
    });
    initDropdown(picker, value => {
        const template = templates[Number(value)];
        if (template) grid.replaceChildren(template.content.cloneNode(true));
    });
}
