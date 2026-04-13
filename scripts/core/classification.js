import { AppError, TimeoutError, NetworkError, NoPokemonError, ClassificationError } from "./errors.js";

export async function classify(file, apiUrl, timeoutMs = 30000) {
    const formData = new FormData();
    formData.append("file", file); 
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('API response error:', errorData);
            throw ClassificationError(
                errorData.error || errorData.message || `HTTP ${response.status}`
            );
        }
        
        const data = await response.json();
        
        if (!data.pokemonName) {
            throw NoPokemonError();
        }
        
        return data.pokemonName;
        
    } catch (error) {
        clearTimeout(timeoutId);
        
        if (error instanceof AppError) throw error;
        
        if (error.name === "AbortError") {
            throw TimeoutError();
        }
        
        if (error.message?.includes("fetch") || error.message?.includes("network")) {
            throw NetworkError();
        }
        
        throw ClassificationError(error.message);
    }
}