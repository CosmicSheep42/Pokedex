export class APIService {
    constructor({ httpClient, baseUrl, timeoutMs = 30000 }) {
        this.httpClient = httpClient;
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.timeoutMs = timeoutMs;
        this.cache = new Map();
    }

    cachedRequest(url) {
        if (!this.cache.has(url)) {
            const request = this.httpClient.request(url, { timeoutMs: this.timeoutMs })
                .catch(error => { this.cache.delete(url); throw error; });
            this.cache.set(url, request);
        }
        return this.cache.get(url);
    }

    getEvolutionChain(reference) {
        const url = new URL(reference);
        const base = new URL(this.baseUrl);
        if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname + '/evolution-chain/') || !/\/evolution-chain\/\d+\/?$/.test(url.pathname)) {
            throw new Error('Invalid evolution reference');
        }
        return this.cachedRequest(url.href);
    }

    getAbility(reference) {
        const url = new URL(reference);
        const base = new URL(this.baseUrl);
        if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname + '/ability/') || !/\/ability\/\d+\/?$/.test(url.pathname)) {
            throw new Error('Invalid ability reference');
        }
        return this.cachedRequest(url.href);
    }

    async getPokemon(identifier) {
        const safeIdentifier = encodeURIComponent(String(identifier).toLowerCase());
        return this.cachedRequest(`${this.baseUrl}/pokemon/${safeIdentifier}`);
    }

    async getSpecies(pokemonId) {
        const safeIdentifier = encodeURIComponent(String(pokemonId).toLowerCase());
        return this.cachedRequest(`${this.baseUrl}/pokemon-species/${safeIdentifier}`);
    }
}
