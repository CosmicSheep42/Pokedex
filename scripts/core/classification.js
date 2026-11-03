import { InvalidResponseError } from "./errors.js";

export async function classify(file, apiUrl, timeoutMs = 90000, httpClient) {
    const formData = new FormData();
    formData.append("file", file);
    const data = await httpClient.request(apiUrl, { method: "POST", body: formData, timeoutMs });
    if (typeof data?.pokemonName !== "string" || !data.pokemonName.trim()) {
        throw InvalidResponseError();
    }
    return data.pokemonName;
}
