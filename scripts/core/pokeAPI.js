export class APIService {
    constructor({ httpClient, baseUrl, timeoutMs = 30000 }) {
        this.httpClient = httpClient;
        this.baseUrl = baseUrl.replace(/\/$/, "");
        this.timeoutMs = timeoutMs;
    }

    async getPokemon(identifier) {
        const safeIdentifier = encodeURIComponent(String(identifier).toLowerCase());
        return this.httpClient.request(`${this.baseUrl}/pokemon/${safeIdentifier}`, {
            timeoutMs: this.timeoutMs
        });
    }

    async getSpecies(pokemonId) {
        return this.httpClient.request(`${this.baseUrl}/pokemon-species/${pokemonId}`, {
            timeoutMs: this.timeoutMs
        });
    }
}
