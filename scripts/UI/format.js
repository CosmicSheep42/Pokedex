// "generation-viii" -> "Generation VIII", "heartgold-soulsilver" -> "Heartgold Soulsilver"
export function formatName(value) {
    if (typeof value !== 'string') return '';
    return value.replace(/[-_]/g, ' ').replace(/\S+/g, word => /^[ivx]+$/i.test(word) ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1));
}
