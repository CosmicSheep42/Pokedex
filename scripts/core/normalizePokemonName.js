import { InvalidResponseError } from "./errors.js";

const exceptions = {
    "type: null": "772", "type-null": "772", typenull: "772",
    pyroar: "668", "pyroar-male": "668", "pyroar-female": "668",
    "nidoran♂": "32", "nidoran-m": "32", nidoranm: "32",
    "nidoran♀": "29", "nidoran-f": "29", nidoranf: "29",
    meowstic: "678", "meowstic-male": "678", "meowstic-female": "678"
};

export function normalizePokemonName(name) {
    if (typeof name !== "string") throw InvalidResponseError();
    const value = name.toLowerCase().trim();
    const identifier = exceptions[value] || value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (!identifier) throw InvalidResponseError();
    return identifier;
}
