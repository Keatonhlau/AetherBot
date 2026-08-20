"use strict";
// GitHub API client using native fetch()
// All GitHub API logic lives here — never in command files.
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitHubClient = void 0;
// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------
class GitHubClient {
    baseUrl = "https://api.github.com";
    token;
    constructor(token) {
        this.token = token;
    }
    headers() {
        const h = {
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "AetherBot/1.0",
        };
        if (this.token) {
            h["Authorization"] = `Bearer ${this.token}`;
        }
        return h;
    }
    async get(path) {
        const url = `${this.baseUrl}${path}`;
        try {
            const res = await fetch(url, { headers: this.headers() });
            if (res.status === 404) {
                return { ok: false, status: 404, message: "Not found" };
            }
            if (res.status === 403 || res.status === 429) {
                const reset = res.headers.get("x-ratelimit-reset");
                console.warn(`[github] Rate limited. Reset at: ${reset ? new Date(parseInt(reset, 10) * 1000).toISOString() : "unknown"}`);
                return { ok: false, status: res.status, message: "Rate limited" };
            }
            if (!res.ok) {
                const text = await res.text().catch(() => "");
                console.error(`[github] HTTP ${res.status} for ${path}: ${text}`);
                return { ok: false, status: res.status, message: `HTTP ${res.status}` };
            }
            const data = (await res.json());
            return { ok: true, data };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error(`[github] Network error for ${path}: ${msg}`);
            return { ok: false, status: 0, message: `Network error: ${msg}` };
        }
    }
    async getReleases(repo) {
        return this.get(`/repos/${repo}/releases?per_page=10`);
    }
    async getLatestRelease(repo) {
        return this.get(`/repos/${repo}/releases/latest`);
    }
    async getRepo(repo) {
        return this.get(`/repos/${repo}`);
    }
    async getUser(username) {
        return this.get(`/users/${username}`);
    }
    async getFileContent(repo, filePath, branch) {
        const branchParam = branch ? `?ref=${branch}` : "";
        const result = await this.get(`/repos/${repo}/contents/${filePath}${branchParam}`);
        if (!result.ok)
            return result;
        if (result.data.encoding !== "base64") {
            return { ok: false, status: 0, message: "Unexpected file encoding" };
        }
        // GitHub returns base64 with newlines; strip them
        const content = Buffer.from(result.data.content.replace(/\n/g, ""), "base64").toString("utf-8");
        return { ok: true, data: content };
    }
    /**
     * Fetch aether-verify.txt from the repo, trying main then master.
     * Returns the file contents (trimmed) or null if not found.
     */
    async getVerifyTxt(repo) {
        for (const branch of ["main", "master"]) {
            const result = await this.getFileContent(repo, "aether-verify.txt", branch);
            if (result.ok) {
                return result.data.trim();
            }
            if (result.status !== 404) {
                // A real error — stop trying
                return null;
            }
        }
        return null;
    }
    /**
     * Fetch the raw index.json from the registry repo.
     */
    async getRegistryIndex(registryRepo) {
        // Use raw.githubusercontent.com for the actual file content
        const [owner, repo] = registryRepo.split("/");
        try {
            const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/main/index.json`, { headers: this.headers() });
            if (!res.ok) {
                return { ok: false, status: res.status, message: `HTTP ${res.status}` };
            }
            const data = await res.json();
            return { ok: true, data };
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            return { ok: false, status: 0, message: `Network error: ${msg}` };
        }
    }
}
exports.GitHubClient = GitHubClient;
//# sourceMappingURL=github.js.map