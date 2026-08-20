export interface Extension {
    id: string;
    name: string;
    author: string;
    description?: string;
    version?: string;
    url?: string;
    install_url?: string;
    iconUrl?: string;
    repository?: string;
    trust: "official" | "verified" | "community";
}
export interface RegistryCache {
    extensions: Extension[];
    fetchedAt: number;
    healthy: boolean;
}
export declare function refreshRegistry(): Promise<void>;
export declare function onRegistryRefresh(cb: (prev: Extension[], next: Extension[]) => void): void;
export declare function getRegistry(): Promise<Extension[]>;
export declare function getExtension(id: string): Extension | undefined;
export interface RegistryStatusInfo {
    count: number;
    cacheAgeMs: number;
    lastRefresh: number | null;
    healthy: boolean;
    stale: boolean;
}
export declare function getRegistryStatus(): RegistryStatusInfo;
/** Start a background refresh loop (every CACHE_TTL_MS). */
export declare function startRegistryRefreshLoop(): void;
//# sourceMappingURL=registry.d.ts.map