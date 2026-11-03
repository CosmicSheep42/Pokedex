import { AppError, HttpError, TimeoutError, NetworkError, InvalidResponseError } from "./errors.js";

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
            let response;
            try {
                response = await fetch(url, { method, headers, body, signal: controller.signal });
            } catch (error) {
                if (error instanceof TypeError) throw NetworkError();
                throw error;
            }

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

            throw error;
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async #readPayload(response) {
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
            if (response.ok) throw InvalidResponseError();
            return response.text();
        }
        try {
            return await response.json();
        } catch {
            throw InvalidResponseError();
        }
    }

    #extractErrorMessage(payload) {
        if (!payload) return null;
        if (typeof payload === "string") return payload;
        if (typeof payload === "object") return payload.detail || payload.error || payload.message || null;
        return null;
    }
}
