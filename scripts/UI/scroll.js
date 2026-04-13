let isDragging = false;
let startY = 0;
let startScrollTop = 0;

export function initDragScroll(carouselElement) {
    if (!carouselElement || carouselElement.dataset.dragInitialized === 'true') return;

    function onMouseDown(e) {
        e.preventDefault();
        isDragging = true;
        startY = e.clientY;
        startScrollTop = carouselElement.scrollTop;
        carouselElement.style.cursor = 'grabbing';
        carouselElement.style.scrollBehavior = 'auto';
        window.getSelection()?.removeAllRanges();
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        e.preventDefault();
        const deltaY = e.clientY - startY;
        carouselElement.scrollTop = startScrollTop - deltaY;
    }

    function onMouseUp() {
        if (!isDragging) return;
        isDragging = false;
        carouselElement.style.cursor = 'grab';
        carouselElement.style.scrollBehavior = '';
    }

    function onMouseLeave() {
        if (isDragging) {
            isDragging = false;
            carouselElement.style.cursor = 'grab';
            carouselElement.style.scrollBehavior = '';
        }
    }

    carouselElement.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    carouselElement.addEventListener('mouseleave', onMouseLeave);
    carouselElement.addEventListener('dragstart', (e) => e.preventDefault());
    carouselElement.style.cursor = 'grab';
    carouselElement.dataset.dragInitialized = 'true';
}
