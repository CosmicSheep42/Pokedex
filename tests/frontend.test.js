import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizePokemonName } from '../scripts/core/normalizePokemonName.js';
import { HttpClient } from '../scripts/core/httpClient.js';
import { classify } from '../scripts/core/classification.js';
import { fetchData } from '../scripts/core/fetchData.js';
import { validateImageFile } from '../scripts/modules/upload.js';
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

test('classification and PokeAPI integration use the expected contracts', async () => {
    const originalFetch = globalThis.fetch;
    const requests = [];
    globalThis.fetch = async (url, options) => {
        requests.push(String(url));
        const data = String(url).endsWith('/classify') ? { pokemonName: 'Mr. Mime' }
            : String(url).endsWith('/pokemon/mr-mime') ? { name: 'mr-mime', species: { name: 'mr-mime' } }
            : { genera: [], flavor_text_entries: [] };
        if (options.method === 'POST') assert.equal(options.body.get('file').type, 'image/png');
        return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
    };
    try {
        const file = new Blob(['image'], { type: 'image/png' });
        const result = await new fetchData({ backendURL: 'https://example.com/classify', pokeApiBaseUrl: 'https://example.com/api', timeoutMs: 100 }).execute(file);
        assert.equal(result.prediction, 'mr-mime');
        assert.deepEqual(requests, ['https://example.com/classify', 'https://example.com/api/pokemon/mr-mime', 'https://example.com/api/pokemon-species/mr-mime']);
        globalThis.fetch = async () => new Response('{}', { headers: { 'content-type': 'application/json' } });
        await assert.rejects(classify(file, '/classify', 100, new HttpClient()), { code: 'INVALID_RESPONSE' });
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('upload validation rejects invalid and oversized files', () => {
    assert.match(validateImageFile({ type: 'text/html', size: 1 }, 10), /JPEG/);
    assert.match(validateImageFile({ type: 'image/png', size: 11 }, 10), /under/);
    assert.match(validateImageFile({ type: 'image/png', size: 0 }, 10), /empty/);
    assert.equal(validateImageFile({ type: 'image/png', size: 5 }, 10), null);
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
