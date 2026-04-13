import { initDragScroll } from "./scroll.js";
import { applyColor } from "./colors.js";

function getCarousel() {
    return document.getElementById('carouselContainer');
}

export function buildCarousel(slidesArray, pokemonData = null) {
    const carousel = getCarousel();
    if (!carousel) return;

    initDragScroll(carousel);
    const typeColor = applyColor(pokemonData);

    carousel.innerHTML = '';
    slidesArray.forEach((slideData) => {
        const slide = document.createElement('div');
        slide.className = 'screen-page';
        slide.style.backgroundColor = slideData.bgColor || '#ffffff';
        slide.style.color = slideData.textColor || '#333';
        slide.style.setProperty('--type-color', typeColor);
        slide.style.setProperty('--title-color', typeColor);
        
        const contentWrapper = document.createElement('div');
        contentWrapper.style.width = '100%';
        contentWrapper.innerHTML = slideData.html;
        slide.appendChild(contentWrapper);
        carousel.appendChild(slide);
    });
    
    carousel.scrollTop = 0;
    
    setTimeout(() => {
        slidesArray.forEach((slide) => slide.onRender?.());
    }, 50);
}