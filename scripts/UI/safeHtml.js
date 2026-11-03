export function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
}

export function safeImageUrl(value) {
    if (typeof value !== "string") return "";
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? escapeHtml(url.href) : "";
    } catch {
        return "";
    }
}
