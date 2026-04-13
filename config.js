export const CONFIG = {
    REQUEST_TIMEOUT: 30000,
     BACKEND_URL: "https://cosmicsheep42-backend.hf.space/classify",
     POKEAPI: {
        BASE_URL: "https://pokeapi.co/api/v2"
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = CONFIG;
}