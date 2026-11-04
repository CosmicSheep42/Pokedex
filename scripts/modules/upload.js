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

function setupFileInput(buttonElement, cameraInput, galleryInput, sourceDialog) {
    if (!buttonElement || !cameraInput || !galleryInput || !sourceDialog) return;

    buttonElement.addEventListener('click', () => {
        if (buttonElement.disabled) return;
        if (globalThis.matchMedia?.('(pointer: coarse)').matches && sourceDialog.showModal) {
            sourceDialog.showModal();
        } else {
            galleryInput.click();
        }
    });

    sourceDialog.addEventListener('click', (event) => {
        const source = event.target.getAttribute('data-upload-source');
        if (!source) return;
        sourceDialog.close();
        if (source === 'camera') cameraInput.click();
        if (source === 'gallery') galleryInput.click();
    });

    const handleChange = (e) => {
        if (e.target.files.length) {
            processFile(e.target.files[0]);
            e.target.value = '';
        }
    };
    cameraInput.addEventListener('change', handleChange);
    galleryInput.addEventListener('change', handleChange);
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
    
    const cameraInput = document.createElement('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/jpeg,image/png,image/webp,image/gif';
    cameraInput.setAttribute('capture', 'environment');
    cameraInput.hidden = true;
    cameraInput.setAttribute('data-pokemon-upload-input', '');

    const galleryInput = document.createElement('input');
    galleryInput.type = 'file';
    galleryInput.accept = cameraInput.accept;
    galleryInput.hidden = true;
    galleryInput.setAttribute('data-pokemon-upload-input', '');

    const sourceDialog = document.createElement('dialog');
    sourceDialog.className = 'upload-source-dialog';
    sourceDialog.setAttribute('aria-label', 'Choose an image source');
    const dialogTitle = document.createElement('h2');
    dialogTitle.textContent = 'Choose an image source';
    sourceDialog.appendChild(dialogTitle);
    for (const [source, label] of [['camera', 'Take a photo'], ['gallery', 'Choose from gallery'], ['cancel', 'Cancel']]) {
        const option = document.createElement('button');
        option.type = 'button';
        option.textContent = label;
        option.setAttribute('data-upload-source', source);
        sourceDialog.appendChild(option);
    }
    
    container.appendChild(button);
    container.appendChild(cameraInput);
    container.appendChild(galleryInput);
    container.appendChild(sourceDialog);
    
    setupFileInput(button, cameraInput, galleryInput, sourceDialog);
    
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
