export class AppError extends Error {
    constructor(message, code = "APP_ERROR") {
        super(message);
        this.name = "AppError";
        this.code = code;
    }
}

export class HttpError extends AppError {
    constructor(message, status, data = null) {
        super(message, "HTTP_ERROR");
        this.name = "HttpError";
        this.status = status;
        this.data = data;
    }
}

export function TimeoutError() {
    return new AppError("Request timed out. Please try again.", "TIMEOUT");
}

export function NetworkError() {
    return new AppError("Network error. Check your connection.", "NETWORK");
}

export function NoPokemonError() {
    return new AppError("No Pokémon identified in the image.", "NO_POKEMON");
}

export function ClassificationError(details = "") {
    const message = details 
        ? `Failed to identify: ${details}`
        : "Failed to identify Pokémon. Try a clearer image.";
    return new AppError(message, "CLASSIFICATION_ERROR");
}

export function getErrorMessage(error) {
    if (typeof error === "string") return error;
    
    const messages = {
        "TIMEOUT": "Request timed out. Please try again.",
        "NETWORK": "Connection error. Check your internet.",
        "NO_POKEMON": "Couldn't identify a Pokémon in this image.",
        "CLASSIFICATION_ERROR": "Failed to identify. Try another image.",
        "HTTP_ERROR": "Service error. Please try again later.",
        "APP_ERROR": "Something went wrong. Try again."
    };
    
    return messages[error.code] || error.message || "An error occurred. Please try again.";
}
