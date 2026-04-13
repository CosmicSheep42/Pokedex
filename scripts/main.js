import { fetchData } from "./core/fetchData.js";
import { renderResult } from "./UI/renderResults.js";
import { setHandler, showScanner, createUploadButton } from "./modules/upload.js";
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
    
    bottomContent.innerHTML = '<span class="bottom-text">POKÉDEX</span>';
}

function setBottomToUploadMode() {
    const bottomContent = document.querySelector('.scanner-bottom-content');
    if (!bottomContent) return;
    
    bottomContent.innerHTML = '';
    const uploadButton = createUploadButton('scanner-bottom-upload-btn');
    bottomContent.appendChild(uploadButton);
}

async function handleImageSelected(file) {
    if (isProcessing) return;
    
    setLoadingState(true);
    
    try {
        const result = await FetchData.execute(file);
        renderResult(result);
        setBottomToUploadMode();
    } catch (error) {
        console.error("Error identifying Pokémon:", error);
        alert(getErrorMessage(error));
        showScanner();
        setBottomToTextMode();
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
        hint.innerHTML = isLoading 
            ? "Identifying<br>your Pokemon..." 
            : "Tap to identify<br>your Pokemon";
    }
}

init();