import { AppError, HttpError, TimeoutError, NetworkError } from "./errors.js";

export class HttpClient {
    async request(url, options = {}) {
        const {
            method = "GET",
            headers = {},
            body,
            timeoutMs = 30000
        } = options;

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const response = await fetch(url, {
                method,
                headers,
                body,
                signal: controller.signal
            });

            const payload = await this.#readPayload(response);

            if (!response.ok) {
                const message = this.#extractErrorMessage(payload) || `Request failed with status ${response.status}.`;
                throw new HttpError(message, response.status, payload);
            }

            return payload;
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (error.name === "AbortError") {
                throw TimeoutError();
            }

            if (error instanceof AppError) {
                throw error;
            }

            throw NetworkError();
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async #readPayload(response) {
        const contentType = response.headers.get("content-type") || "";
        if (contentType.includes("application/json")) {
            return response.json();
        }
        return response.text();
    }

    #extractErrorMessage(payload) {
        if (!payload) return null;
        if (typeof payload === "string") return payload;
        if (typeof payload === "object" && payload.error) return payload.error;
        return null;
    }
}