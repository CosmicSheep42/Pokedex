export function validateImageFile(file, maxSize) {
    if (!file || !['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
        return 'Choose a JPEG, PNG, WebP, or GIF image.';
    }
    if (file.size === 0) return 'The image is empty.';
    if (file.size > maxSize) return `Image must be under ${Math.round(maxSize / 1024 / 1024)} MB.`;
    return null;
}

let handleImage = null;

export function setHandler(handler) {
    handleImage = typeof handler === "function" ? handler : null;
}

function processFile(file) {
    if (!file) return;
    handleImage?.(file);
}

function setupFileInput(buttonElement, fileInputElement) {
    if (!buttonElement || !fileInputElement) return;

    buttonElement.addEventListener('click', () => {
        if (!buttonElement.disabled) {
            fileInputElement.click();
        }
    });

    fileInputElement.addEventListener('change', (e) => {
        if (e.target.files.length) {
            processFile(e.target.files[0]);
            fileInputElement.value = '';
        }
    });
}

export function createUploadButton(extraClass = '') {
    const className = ['pokeball-btn', extraClass].filter(Boolean).join(' ');
    
    const container = document.createElement('div');
    container.className = 'upload-button-container';
    
    const button = document.createElement('button');
    button.className = className;
    button.type = 'button';
    button.setAttribute('aria-label', 'Choose image');
    button.setAttribute('data-pokemon-upload-trigger', '');
    
    const inner = document.createElement('div');
    inner.className = 'pokeball-inner';
    
    const innerButton = document.createElement('div');
    innerButton.className = 'pokeball-button';
    
    inner.appendChild(innerButton);
    button.appendChild(inner);
    
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
    fileInput.hidden = true;
    fileInput.setAttribute('data-pokemon-upload-input', '');
    
    container.appendChild(button);
    container.appendChild(fileInput);
    
    setupFileInput(button, fileInput);
    
    return container;
}

export function showScanner() {
    const carousel = document.getElementById('carouselContainer');
    if (!carousel) return;

    const uploadContainer = createUploadButton();
    
    carousel.replaceChildren();
    
    const scannerDiv = document.createElement('div');
    scannerDiv.className = 'pokedex-scanner scanner-screen';
    
    const centerDiv = document.createElement('div');
    centerDiv.className = 'scanner-center';
    
    const hint = document.createElement('p');
    hint.className = 'scanner-hint';
    hint.textContent = 'Tap to identify your Pokémon';
    
    centerDiv.appendChild(uploadContainer);
    centerDiv.appendChild(hint);
    scannerDiv.appendChild(centerDiv);
    carousel.appendChild(scannerDiv);
}
