let handleImage = null;

export function setHandler(handler) {
    handleImage = typeof handler === "function" ? handler : null;
}

function processFile(file) {
    if (!file) return;

    if (file.type.startsWith('image/')) {
        if (handleImage) {
            handleImage(file);
        } else {
            alert('No image handler is configured.');
        }
        return;
    }

    alert('Please choose a valid image.');
}

function setupFileInput(buttonElement, fileInputElement) {
    if (!buttonElement || !fileInputElement) return;

    const newButton = buttonElement.cloneNode(true);
    buttonElement.parentNode.replaceChild(newButton, buttonElement);
    
    const newFileInput = fileInputElement.cloneNode(true);
    fileInputElement.parentNode.replaceChild(newFileInput, fileInputElement);

    newButton.addEventListener('click', () => {
        if (!newButton.disabled) {
            newFileInput.click();
        }
    });

    newFileInput.addEventListener('change', (e) => {
        if (e.target.files.length) {
            processFile(e.target.files[0]);
            newFileInput.value = '';
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
    fileInput.accept = 'image/*';
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
    
    carousel.innerHTML = '';
    
    const scannerDiv = document.createElement('div');
    scannerDiv.className = 'pokedex-scanner scanner-screen';
    
    const centerDiv = document.createElement('div');
    centerDiv.className = 'scanner-center';
    
    const hint = document.createElement('p');
    hint.className = 'scanner-hint';
    hint.innerHTML = 'Tap to identify<br>your Pokemon';
    
    centerDiv.appendChild(uploadContainer);
    centerDiv.appendChild(hint);
    scannerDiv.appendChild(centerDiv);
    carousel.appendChild(scannerDiv);
}