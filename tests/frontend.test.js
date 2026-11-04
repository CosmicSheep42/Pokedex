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
