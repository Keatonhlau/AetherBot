export interface GitHubRelease {
    id: number;
    tag_name: string;
    name: string;
    body: string;
    prerelease: boolean;
    draft: boolean;
    published_at: string;
    html_url: string;
    assets: GitHubAsset[];
}
export interface GitHubAsset {
    name: string;
    size: number;
    browser_download_url: string;
}
export interface GitHubUser {
    login: string;
    id: number;
    avatar_url: string;
    html_url: string;
}
export interface GitHubRepo {
    full_name: string;
    description: string | null;
    html_url: string;
    stargazers_count: number;
    default_branch: string;
}
export type GitHubResult<T> = {
    ok: true;
    data: T;
} | {
    ok: false;
    status: number;
    message: string;
};
export declare class GitHubClient {
    private readonly baseUrl;
    private readonly token;
    constructor(token: string);
    private headers;
    private get;
    getReleases(repo: string): Promise<GitHubResult<GitHubRelease[]>>;
    getLatestRelease(repo: string): Promise<GitHubResult<GitHubRelease>>;
    getRepo(repo: string): Promise<GitHubResult<GitHubRepo>>;
    getUser(username: string): Promise<GitHubResult<GitHubUser>>;
    getFileContent(repo: string, filePath: string, branch?: string): Promise<GitHubResult<string>>;
    /**
     * Fetch aether-verify.txt from the repo, trying main then master.
     * Returns the file contents (trimmed) or null if not found.
     */
    getVerifyTxt(repo: string): Promise<string | null>;
    /**
     * Fetch the raw index.json from the registry repo.
     */
    getRegistryIndex(registryRepo: string): Promise<GitHubResult<unknown>>;
}
//# sourceMappingURL=github.d.ts.map