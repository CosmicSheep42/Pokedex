import { classify } from "./classification.js";
import { APIService } from "./pokeAPI.js";
import { HttpClient } from "./httpClient.js";

function normalizePokemonName(name) {
    if (!name) return null;
    
    let normalized = name.toLowerCase().trim();
    
    // Type Null special case
    if (normalized === 'type: null' || normalized === 'type-null' || normalized === 'typenull') {
        return '772';
    }

    // Pyroar special case
    if (normalized === 'pyroar' || normalized === 'pyroar-male' || normalized === 'pyroar-female') {
        return '668';
    }

    // NidoranM special case
    if (normalized === 'nidoran♂' || normalized === 'nidoran-m' || normalized === 'nidoranm') {
        return '32';
    }

    // NidoranF special case
    if (normalized === 'nidoran♀' || normalized === 'nidoran-f' || normalized === 'nidoranf') {
        return '29';
    }

    // Meowstic special case
    if (normalized === 'meowstic' || normalized === 'meowstic-male' || normalized === 'meowstic-female') {
        return '678';
    }
    normalized = normalized.replace(/[^a-z0-9-]/g, '');
    return normalized;
}

export class fetchData {
    constructor({ backendURL, pokeApiBaseUrl, timeoutMs }) {
        this.backendURL = backendURL;
        this.pokeApiService = new APIService({
            httpClient: new HttpClient(),
            baseUrl: pokeApiBaseUrl,
            timeoutMs
        });
        this.timeoutMs = timeoutMs;
    }

    async execute(imageFile) {
        let identifier = await classify(
            imageFile, 
            this.backendURL, 
            this.timeoutMs
        );
        
        identifier = normalizePokemonName(identifier);
        
        const [pokemon, species] = await Promise.all([
            this.pokeApiService.getPokemon(identifier),
            this.pokeApiService.getSpecies(identifier)
        ]);
        
        return { prediction: identifier, pokemon, species };
    }
}