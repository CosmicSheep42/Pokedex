import test from 'node:test';
import assert from 'node:assert/strict';
import { APIService } from '../scripts/core/pokeAPI.js';
import { artworkSources, renderBasic } from '../scripts/modules/basic.js';
import { typeColors, typeTheme } from '../scripts/UI/colors.js';
import { renderBiology, renderEvolution, evolutionConditions } from '../scripts/modules/biology.js';
import { renderForms } from '../scripts/modules/forms.js';
import { renderOverview } from '../scripts/modules/overview.js';
import { renderStats, statProfile } from '../scripts/modules/stats.js';
import { renderTabs } from '../scripts/UI/tabs.js';

const luminance = hex => hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255)
    .map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((sum, c, index) => sum + c * [.2126, .7152, .0722][index], 0);

test('18 themes keep strong text and selected controls at AA contrast', () => {
    assert.equal(Object.keys(typeColors).length, 18);
    for (const type of Object.keys(typeColors)) {
        const theme = typeTheme(type);
        for (const background of ['#ffffff', theme.subtle, theme.light]) {
            assert.ok((luminance(background) + .05) / (luminance(theme.strong) + .05) >= 4.5, type);
        }
    }
});
test('hero prioritizes official art, uses species ID and never substitutes normal for shiny', () => {
    const data = { sprites: { front_default: 'https://example.com/sprite.png', other: { 'official-artwork': { front_default: 'https://example.com/art.png' }, home: { front_default: 'https://example.com/home.png' } } } };
    assert.deepEqual(artworkSources(data), ['https://example.com/art.png', 'https://example.com/home.png', 'https://example.com/sprite.png']);
    assert.deepEqual(artworkSources(data, true), []);
    const html = renderBasic(data, '<name>', 10001, { id: 386 });
    assert.match(html, /#0386/);
    assert.match(html, /&lt;name&gt;/);
    assert.match(html, /data-artwork="shiny" aria-pressed="false" disabled/);
    data.sprites.front_shiny = 'javascript:alert(1)';
    assert.deepEqual(artworkSources(data, true), []);
});
test('PokéAPI cache deduplicates requests, retains timeouts and allows retry after errors', async () => {
    const requests = [];
    let fail = true;
    const api = new APIService({ baseUrl: 'https://pokeapi.co/api/v2', timeoutMs: 12000, httpClient: { async request(url, options) {
        requests.push({ url, options });
        if (url.includes('evolution-chain') && fail) throw new Error('Offline');
        return { name: 'deoxys-attack' };
    } } });
    await Promise.all([api.getPokemon('deoxys-attack'), api.getPokemon('deoxys-attack')]);
    assert.equal(requests.length, 1);
    await assert.rejects(api.getEvolutionChain('https://pokeapi.co/api/v2/evolution-chain/1/'));
    fail = false;
    await api.getEvolutionChain('https://pokeapi.co/api/v2/evolution-chain/1/');
    await api.getEvolutionChain('https://pokeapi.co/api/v2/evolution-chain/1/');
    assert.equal(requests.length, 3);
    assert.ok(requests.every(r => r.options.timeoutMs === 12000));
    assert.throws(() => api.getEvolutionChain('https://other.example/evolution-chain/1/'));
});
test('biology represents gender honestly, omits absent fields and supports evolution branches', () => {
    assert.match(renderBiology({ gender_rate: -1 }), /Genderless/);
    assert.doesNotMatch(renderBiology({ gender_rate: -1 }), /gender-bar/);
    assert.match(renderBiology({ gender_rate: 1, hatch_counter: 0 }), /87.5% male/);
    assert.doesNotMatch(renderBiology({}), /gender-bar|Hatch cycles/);
    const html = renderEvolution({ species: { name: '<eevee>' }, evolves_to: [
        { species: { name: 'vaporeon' }, evolution_details: [{ trigger: { name: 'use-item' }, item: { name: 'water-stone' } }] },
        { species: { name: 'jolteon' } }
    ] });
    assert.match(html, /&lt;eevee&gt;/);
    assert.match(html, /vaporeon/); assert.match(html, /jolteon/); assert.match(html, /water stone/);
    assert.equal(evolutionConditions([]), '');
});
test('overview preserves zero and escapes optional facts; forms are only species varieties', () => {
    const html = renderOverview({ base_experience: 0 }, { base_happiness: 0, habitat: { name: '<forest>' } });
    assert.match(html, /<dd>0<\/dd>/); assert.match(html, /&lt;forest&gt;/);
    assert.match(renderForms({}, {}), /Only one known variety/);
    const forms = renderForms({ name: 'deoxys-normal' }, { varieties: [ { is_default: true, pokemon: { name: 'deoxys-normal' } }, { pokemon: { name: 'deoxys-attack' } } ], evolves_from_species: { name: 'not-a-form' } });
    assert.match(forms, /aria-pressed="true"/); assert.doesNotMatch(forms, /not-a-form/);
});
test('stats radar uses fixed six-axis scale and deterministic profile', () => {
    const stats = ['hp', 'attack', 'defense', 'special-attack', 'special-defense', 'speed'].map(name => ({ stat: { name }, base_stat: 50 }));
    assert.match(renderStats({ stats }), /class="stat-radar"/);
    assert.match(renderStats({ stats }), /<strong>300<\/strong>/);
    assert.match(renderStats({ stats }), /19.607843137254903%/);
    assert.equal(statProfile([50, 50, 50, 50, 50, 50]), 'Balanced');
    assert.equal(statProfile([50, 50, 50, 50, 50, 100]), 'Speed-oriented');
    assert.doesNotMatch(renderStats({ stats: [] }), /class="stat-radar"/);
});
test('tabs expose five unique tab/panel associations and a single selected tab', () => {
    const html = renderTabs();
    assert.equal((html.match(/role="tab"/g) || []).length, 5);
    assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
    assert.equal(new Set([...html.matchAll(/aria-controls="([^"]+)"/g)].map(m => m[1])).size, 5);
});

test('flavor selects valid English entries rather than a missing last description', async () => {
    const { renderFlavorText } = await import('../scripts/modules/flavor.js');
    assert.match(renderFlavorText({ flavor_text_entries: [
        { language: { name: 'en' }, flavor_text: 'Real\nentry' },
        { language: { name: 'en' }, flavor_text: null }
    ] }), /Real entry/);
});

test('tabs support arrows, Home/End and reset a deeply scrolled panel', async () => {
    const { initTabs, resultTabs } = await import('../scripts/UI/tabs.js');
    const panels = new Map();
    const buttons = resultTabs.map(label => {
        const name = label.toLowerCase();
        panels.set(`#panel-${name}`, { hidden: name !== 'overview' });
        return {
            id: `tab-${name}`, listeners: {}, attributes: { 'aria-controls': `panel-${name}` },
            addEventListener(type, handler) { this.listeners[type] = handler; },
            getAttribute(name) { return this.attributes[name]; },
            setAttribute(name, value) { this.attributes[name] = value; },
            focus() { this.focused = true; }, scrollIntoView() {}
        };
    });
    const root = { scrollTop: 2000, querySelectorAll: () => buttons,
        querySelector: selector => selector === '.result-hero-host' ? { offsetHeight: 400 } : panels.get(selector) };
    const selected = [];
    initTabs(root, name => selected.push(name));
    const key = (index, value) => buttons[index].listeners.keydown({ key: value, preventDefault() {} });
    key(0, 'ArrowRight');
    assert.equal(selected.at(-1), 'stats'); assert.equal(root.scrollTop, 400);
    assert.equal(buttons[1].focused, true); assert.equal(buttons[1].tabIndex, 0);
    assert.equal(panels.get('#panel-overview').hidden, true); assert.equal(panels.get('#panel-stats').hidden, false);
    key(1, 'End'); assert.equal(selected.at(-1), 'sprites');
    key(4, 'ArrowRight'); assert.equal(selected.at(-1), 'overview');
    key(0, 'ArrowLeft'); assert.equal(selected.at(-1), 'sprites');
    key(4, 'Home'); assert.equal(selected.at(-1), 'overview');
});
