import { classify } from "./classification.js";
import { APIService } from "./pokeAPI.js";
import { HttpClient } from "./httpClient.js";
import { normalizePokemonName } from "./normalizePokemonName.js";

export class FetchData {
    constructor({ backendURL, pokeApiBaseUrl, classifierTimeoutMs, pokeApiTimeoutMs }) {
        this.backendURL = backendURL;
        this.httpClient = new HttpClient();
        this.pokeApiService = new APIService({
            httpClient: this.httpClient,
            baseUrl: pokeApiBaseUrl,
            timeoutMs: pokeApiTimeoutMs
        });
        this.classifierTimeoutMs = classifierTimeoutMs;
    }

    async execute(imageFile) {
        let identifier = await classify(
            imageFile, 
            this.backendURL, 
            this.classifierTimeoutMs,
            this.httpClient
        );
        
        identifier = normalizePokemonName(identifier);
        
        const species = await this.pokeApiService.getSpecies(identifier);
        const defaultPokemon = species.varieties?.find(({ is_default }) => is_default)?.pokemon?.name || identifier;
        const pokemon = await this.pokeApiService.getPokemon(defaultPokemon);
        
        return { prediction: identifier, pokemon, species };
    }
}
