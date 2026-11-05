export const typeColors = {
    normal: '#A8A878', fire: '#F08030', water: '#6890F0',
    electric: '#F8D030', grass: '#78C850', ice: '#98D8D8',
    fighting: '#C03028', poison: '#A040A0', ground: '#E0C068',
    flying: '#A890F0', psychic: '#F85888', bug: '#A8B820',
    rock: '#B8A038', ghost: '#705898', dragon: '#7038F8',
    dark: '#705848', steel: '#B8B8D0', fairy: '#EE99AC'
};

// Dark text/control tones stay readable even for pale types such as Electric and Ice.
export function typeTheme(type) {
    const primary = typeColors[type] || typeColors.normal;
    const channels = primary.slice(1).match(/../g).map(value => parseInt(value, 16));
    const mix = (target, amount) => '#' + channels.map(value => Math.round(value + (target - value) * amount).toString(16).padStart(2, '0')).join('');
    const lum = channels.map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    // Text drawn directly on the primary color: white on dark types, near-black on pale ones.
    const ink = lum > .3 ? '#1d1a17' : '#ffffff';
    const L = hex => hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const ratio = (a, b) => (Math.max(L(a), L(b)) + .05) / (Math.min(L(a), L(b)) + .05);
    // Lightest darkening of the type color that still reads at AA on white, subtle and light backgrounds.
    let amount = .2;
    while (amount < .8 && ['#ffffff', mix(255, 0.91), mix(255, 0.60)].some(bg => ratio(mix(0, amount), bg) < 4.6)) amount += .02;
    return { primary, ink, strong: mix(0, amount), light: mix(255, 0.60), subtle: mix(255, 0.91), deep: mix(0, 0.22), edge: mix(0, 0.42), contrast: '#ffffff' };
}

export function applyColor(pokemonData, target = document.documentElement) {
    const type = [...(pokemonData?.types || [])].sort((a, b) => a.slot - b.slot)[0]?.type?.name;
    const theme = typeTheme(type);
    for (const [key, value] of Object.entries(theme)) target.style.setProperty(`--type-${key}`, value);
    target.style.setProperty('--type-color', theme.primary);
    target.style.setProperty('--title-color', theme.strong);
    return theme.primary;
}
