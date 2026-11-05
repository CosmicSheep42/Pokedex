import { escapeHtml, safeImageUrl } from "../UI/safeHtml.js";

const readable = value => value.replace(/[-_]/g, ' ');

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
                    const label = escapeHtml(readable(path + key));
                    items.push(`<figure class="sprite-item"><img src="${url}" alt="${label}" loading="lazy"><figcaption class="sprite-label">${label}</figcaption></figure>`);
                } else if (value && typeof value === 'object') {
                    collect(value, path + key + ' / ');
                }
            }
        }
        collect(source);
        if (!items.length) return null;
        return { title: readable(title), items };
    }).filter(Boolean);
    const heading = '<h2 class="section-title">Sprite Gallery</h2>';
    if (!collections.length) return heading + '<p>No sprites available.</p>';
    return heading + `<div class="sprite-gallery">
        <label class="gallery-label" for="spriteCollection">Collection</label>
        <select id="spriteCollection" class="sprite-select" aria-controls="spriteCollectionGrid">${collections.map((group, index) => `<option value="${index}">${escapeHtml(group.title)} (${group.items.length})</option>`).join('')}</select>
        <div id="spriteCollectionGrid" class="sprite-grid">${collections[0].items.join('')}</div>
        ${collections.map(group => `<template>${group.items.join('')}</template>`).join('')}
    </div>`;
}

export function initSpriteGallery() {
    const gallery = document.querySelector('.sprite-gallery');
    if (!gallery) return;
    const select = gallery.querySelector('select');
    const grid = gallery.querySelector('.sprite-grid');
    const templates = gallery.querySelectorAll('template');
    select.addEventListener('change', () => {
        const template = templates[Number(select.value)];
        if (template) grid.replaceChildren(template.content.cloneNode(true));
    });
}
