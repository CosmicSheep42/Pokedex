import { classify } from "./classification.js";
import { APIService } from "./pokeAPI.js";
import { HttpClient } from "./httpClient.js";
import { normalizePokemonName } from "./normalizePokemonName.js";

export class fetchData {
    constructor({ backendURL, pokeApiBaseUrl, timeoutMs }) {
        this.backendURL = backendURL;
        this.httpClient = new HttpClient();
        this.pokeApiService = new APIService({
            httpClient: this.httpClient,
            baseUrl: pokeApiBaseUrl,
            timeoutMs
        });
        this.timeoutMs = timeoutMs;
    }

    async execute(imageFile) {
        let identifier = await classify(
            imageFile, 
            this.backendURL, 
            this.timeoutMs,
            this.httpClient
        );
        
        identifier = normalizePokemonName(identifier);
        
        const pokemon = await this.pokeApiService.getPokemon(identifier);
        const species = await this.pokeApiService.getSpecies(pokemon.species?.name || identifier);
        
        return { prediction: identifier, pokemon, species };
    }
}
