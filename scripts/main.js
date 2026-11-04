import { fetchData } from "./core/fetchData.js";
import { renderResult } from "./UI/renderResults.js";
import { setHandler, showScanner, createUploadButton, validateImageFile } from "./modules/upload.js";
import { getErrorMessage } from "./core/errors.js";
import { CONFIG } from "../config.js";

let isProcessing = false;
let FetchData = null;

function init() {
    FetchData = new fetchData({
        backendURL: CONFIG.BACKEND_URL,
        pokeApiBaseUrl: CONFIG.POKEAPI.BASE_URL,
        timeoutMs: CONFIG.REQUEST_TIMEOUT
    });
    
    setHandler(handleImageSelected);
    setBottomToTextMode();
    showScanner();
}

function setBottomToTextMode() {
    const bottomContent = document.querySelector('.scanner-bottom-content');
    if (!bottomContent) return;
    
    bottomContent.replaceChildren();
    const text = document.createElement('span');
    text.className = 'bottom-text';
    text.textContent = 'POKÉDEX';
    bottomContent.appendChild(text);
}

function setBottomToUploadMode() {
    const bottomContent = document.querySelector('.scanner-bottom-content');
    if (!bottomContent) return;
    
    bottomContent.replaceChildren();
    const uploadButton = createUploadButton('scanner-bottom-upload-btn');
    bottomContent.appendChild(uploadButton);
}

async function handleImageSelected(file) {
    if (isProcessing) return;
    const validationError = validateImageFile(file, CONFIG.MAX_FILE_SIZE);
    if (validationError) {
        showStatus(validationError, true);
        return;
    }
    
    setLoadingState(true);
    showStatus('');
    
    try {
        const result = await FetchData.execute(file);
        renderResult(result);
        setBottomToUploadMode();
    } catch (error) {
        console.error("Error identifying Pokémon:", error);
        showScanner();
        setBottomToTextMode();
        showStatus(getErrorMessage(error), true);
    } finally {
        setLoadingState(false);
    }
}

function setLoadingState(isLoading) {
    isProcessing = isLoading;
    
    const uploadButtons = document.querySelectorAll('[data-pokemon-upload-trigger]');
    uploadButtons.forEach((button) => {
        button.disabled = isLoading;
    });
    
    const hint = document.querySelector('.scanner-hint');
    if (hint) {
        hint.textContent = isLoading ? 'Identifying your Pokémon…' : 'Tap to identify your Pokémon';
    }
}

function showStatus(message, isError = false) {
    const status = document.getElementById('statusMessage');
    status.textContent = message;
    status.hidden = !message;
    status.classList.toggle('is-error', isError);
}

init();
