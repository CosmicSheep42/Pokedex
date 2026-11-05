import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePokemonName } from '../scripts/core/normalizePokemonName.js';
import { HttpClient } from '../scripts/core/httpClient.js';
import { classify } from '../scripts/core/classification.js';
import { FetchData } from '../scripts/core/fetchData.js';
import { CONFIG } from '../config.js';
import { createUploadButton, validateImageFile } from '../scripts/modules/upload.js';
import { renderBasic } from '../scripts/modules/basic.js';
import { renderFlavorText } from '../scripts/modules/flavor.js';
import { renderStats } from '../scripts/modules/stats.js';
import { renderSprites } from '../scripts/modules/sprites.js';

test('normalizes labels and rejects unusable ones', () => {
    assert.equal(normalizePokemonName('Type: Null'), '772');
    assert.equal(normalizePokemonName('Nidoran♀'), '29');
    assert.equal(normalizePokemonName('Mr. Mime'), 'mr-mime');
    assert.equal(normalizePokemonName('Flabébé'), 'flabebe');
    assert.throws(() => normalizePokemonName('!!!'), { code: 'INVALID_RESPONSE' });
});

test('HTTP client preserves errors, handles invalid data, and aborts slow requests', async () => {
    const originalFetch = globalThis.fetch;
    const client = new HttpClient();
    try {
        globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Too large' }), { status: 413, headers: { 'content-type': 'application/json' } });
        await assert.rejects(client.request('/test'), { status: 413, message: 'Too large' });
        globalThis.fetch = async () => new Response('{', { headers: { 'content-type': 'application/json' } });
        await assert.rejects(client.request('/test'), { code: 'INVALID_RESPONSE' });
        globalThis.fetch = async () => { throw new Error('Programming bug'); };
        await assert.rejects(client.request('/test'), { message: 'Programming bug' });
        globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
        await assert.rejects(client.request('/test'), { code: 'NETWORK' });
        globalThis.fetch = (_, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
        await assert.rejects(client.request('/test', { timeoutMs: 5 }), { code: 'TIMEOUT' });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('classification and PokeAPI integration use their configured timeouts', async () => {
    const originalFetch = globalThis.fetch;
    const originalRequest = HttpClient.prototype.request;
    const requests = [];
    globalThis.fetch = async (url, options) => {
        const data = String(url).endsWith('/classify') ? { pokemonName: 'Deoxys' }
            : String(url).endsWith('/pokemon-species/deoxys') ? {
                name: 'deoxys',
                varieties: [{ is_default: true, pokemon: { name: 'deoxys-normal' } }]
            }
            : String(url).endsWith('/pokemon/deoxys-normal') ? { name: 'deoxys-normal', species: { name: 'deoxys' } }
            : {};
        if (options.method === 'POST') assert.equal(options.body.get('file').type, 'image/png');
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    };
    HttpClient.prototype.request = function (url, options) {
        requests.push({ url: String(url), timeoutMs: options.timeoutMs });
        return originalRequest.call(this, url, options);
    };
    try {
        const file = new Blob(['image'], { type: 'image/png' });
        const result = await new FetchData({
            backendURL: 'https://example.com/classify',
            pokeApiBaseUrl: 'https://example.com/api',
            classifierTimeoutMs: CONFIG.CLASSIFIER_TIMEOUT,
            pokeApiTimeoutMs: CONFIG.POKEAPI_TIMEOUT
        }).execute(file);
        assert.equal(result.prediction, 'deoxys');
        assert.deepEqual(requests.map(({ url }) => url), ['https://example.com/classify', 'https://example.com/api/pokemon-species/deoxys', 'https://example.com/api/pokemon/deoxys-normal']);
        assert.equal(CONFIG.CLASSIFIER_TIMEOUT, 90000);
        assert.equal(CONFIG.POKEAPI_TIMEOUT, 12000);
        assert.deepEqual(requests.map(({ timeoutMs }) => timeoutMs), [CONFIG.CLASSIFIER_TIMEOUT, CONFIG.POKEAPI_TIMEOUT, CONFIG.POKEAPI_TIMEOUT]);
        globalThis.fetch = async () => new Response('{}', { headers: { 'content-type': 'application/json' } });
        await assert.rejects(classify(file, '/classify', 100, new HttpClient()), { code: 'INVALID_RESPONSE' });
    } finally {
        globalThis.fetch = originalFetch;
        HttpClient.prototype.request = originalRequest;
    }
});

test('upload validation rejects invalid and oversized files', () => {
    assert.match(validateImageFile({ type: 'text/html', size: 1 }, 10), /JPEG/);
    assert.match(validateImageFile({ type: 'image/png', size: 11 }, 10), /under/);
    assert.match(validateImageFile({ type: 'image/png', size: 0 }, 10), /empty/);
    assert.equal(validateImageFile({ type: 'image/png', size: 5 }, 10), null);
});

test('mobile upload offers camera and gallery while desktop opens the gallery', () => {
    class Element {
        constructor(tag) { this.tag = tag; this.children = []; this.listeners = {}; this.attributes = {}; this.clickCount = 0; }
        appendChild(child) { child.parent = this; this.children.push(child); }
        addEventListener(type, listener) { this.listeners[type] = listener; }
        setAttribute(name, value) { this.attributes[name] = value; }
        getAttribute(name) { return this.attributes[name] ?? null; }
        click() {
            this.clickCount++;
            const event = { target: this };
            this.listeners.click?.(event);
            this.parent?.listeners.click?.(event);
        }
        showModal() { this.open = true; }
        close() { this.open = false; }
    }

    const previousDocument = globalThis.document;
    const previousMatchMedia = globalThis.matchMedia;
    globalThis.document = { createElement: (tag) => new Element(tag) };
    try {
        globalThis.matchMedia = () => ({ matches: true });
        const mobile = createUploadButton();
        const [button, camera, gallery, dialog] = mobile.children;
        assert.equal(camera.getAttribute('capture'), 'environment');
        assert.equal(gallery.getAttribute('capture'), null);
        button.click();
        assert.equal(dialog.open, true);
        dialog.children[1].click();
        assert.equal(dialog.open, false);
        assert.equal(camera.clickCount, 1);
        button.click();
        dialog.children[2].click();
        assert.equal(gallery.clickCount, 1);

        globalThis.matchMedia = () => ({ matches: false });
        const desktop = createUploadButton();
        desktop.children[0].click();
        assert.equal(desktop.children[2].clickCount, 1);
    } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousMatchMedia === undefined) delete globalThis.matchMedia;
        else globalThis.matchMedia = previousMatchMedia;
    }
});

test('renderers tolerate missing optional data and escape external text', () => {
    const basic = renderBasic({ sprites: {}, types: [], height: null, weight: null }, '<script>', 1, { genera: [{ language: { name: 'en' }, genus: '<img>' }] });
    assert.ok(basic.includes('&lt;script&gt;'));
    assert.ok(basic.includes('&lt;img&gt;'));
    assert.ok(!basic.includes('src="javascript:'));
    assert.ok(renderFlavorText({ flavor_text_entries: [{ language: { name: 'en' }, flavor_text: '<b>Hi</b>' }] }).includes('&lt;b&gt;'));
    assert.ok(renderStats({ stats: [] }).includes('No stats available'));
    assert.ok(renderSprites({ sprites: { front_default: 'javascript:alert(1)' } }).includes('No sprites available'));
});

test('sprite gallery groups collections, hides empty groups and rejects unsafe URLs', () => {
    const url = 'https://example.com/front.png';
    const html = renderSprites({ sprites: {
        front_default: url, front_shiny: url, back_default: null,
        other: { 'official-artwork': { front_default: 'https://example.com/art.png' }, empty: {} },
        versions: { 'generation-i': { red: { front_default: 'https://example.com/red.png' } },
            'generation-ii': { front_default: 'javascript:alert(1)' } }
    } });
    assert.equal((html.match(/role="option"/g) || []).length, 3);
    assert.equal((html.match(/src="https:\/\/example.com\/front.png"/g) || []).length, 2);
    assert.match(html, /official artwork/i);
    assert.match(html, /Generation I</);
    assert.doesNotMatch(html, /javascript:|<details|>empty</);
    assert.match(renderSprites({}), /No sprites available/);
});

test('additional details show available API fields and escape external values', async () => {
    const { renderDetails } = await import('../scripts/modules/details.js');
    const html = renderDetails({ abilities: [{ ability: { name: 'lightning-rod' }, is_hidden: true }] }, {
        generation: { name: 'generation-i' }, habitat: { name: '<forest>' },
        egg_groups: [{ name: 'field' }], growth_rate: { name: 'medium-fast' }
    });
    assert.match(html, /lightning rod \(hidden\)/);
    assert.match(html, /<dd>I<\/dd>/);
    assert.match(html, /&lt;forest&gt;/);
    assert.match(html, /field/);
    assert.match(html, /medium fast/);
    assert.equal(renderDetails({}, null), '');
});

test('species details preserve zero values, genderless species and default varieties', async () => {
    const { renderDetails } = await import('../scripts/modules/details.js');
    const html = renderDetails({ base_experience: 0 }, {
        gender_rate: -1, base_happiness: 0, capture_rate: 3, hatch_counter: 0,
        is_legendary: true, evolves_from_species: { name: '<previous>' },
        varieties: [{ is_default: true, pokemon: { name: 'deoxys-normal' } }, { pokemon: { name: 'deoxys-attack' } }]
    });
    assert.match(html, /Genderless/);
    assert.match(html, /Legendary/);
    assert.match(html, /3 \/ 255/);
    assert.match(html, /Base friendship<\/dt><dd>0/);
    assert.match(html, /Hatch cycles<\/dt><dd>0/);
    assert.match(html, /&lt;previous&gt;/);
    assert.match(html, /deoxys normal.*\(default\)/);
    assert.match(renderDetails({}, { gender_rate: 1 }), /12.5% female \/ 87.5% male/);
    assert.doesNotMatch(renderDetails({}, { gender_rate: null, capture_rate: null }), /Gender ratio|Capture rate/);
});

test('stats keep small values visible separately from bars and show total', () => {
    const html = renderStats({ stats: [ { stat: { name: 'hp' }, base_stat: 1 }, { stat: { name: 'special-defense' }, base_stat: 45 } ] });
    assert.match(html, /stat-value">1<\/span>/);
    assert.match(html, /Sp. Def/);
    assert.match(html, /<strong>46<\/strong>/);
    assert.doesNotMatch(html, /stat-bar-fill[^>]*>1/);
});

test('flavor text attributes its game and safely handles source names', () => {
    assert.match(renderFlavorText({ flavor_text_entries: [{ language: { name: 'en' }, flavor_text: 'Entry', version: { name: '<game>' } }] }), /Pokédex entry · &lt;game&gt;/);
});
