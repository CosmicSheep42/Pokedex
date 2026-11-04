export function initDragScroll(carouselElement) {
    if (!carouselElement || carouselElement.dataset.dragInitialized === 'true') return;
    let isDragging = false;
    let startY = 0;
    let startScrollTop = 0;

    function onMouseDown(e) {
        if (e.button !== 0 || e.target.closest('button, input, a, select, textarea, summary')) return;
        isDragging = true;
        startY = e.clientY;
        startScrollTop = carouselElement.scrollTop;
        carouselElement.style.cursor = 'grabbing';
        carouselElement.style.scrollBehavior = 'auto';
    }

    function onMouseMove(e) {
        if (!isDragging) return;
        const deltaY = e.clientY - startY;
        if (Math.abs(deltaY) < 4) return;
        e.preventDefault();
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
    carouselElement.style.cursor = 'grab';
    carouselElement.dataset.dragInitialized = 'true';
}
