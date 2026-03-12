import type { OverseerrMediaRequest } from '@server/api/overseerr';
import type { TmdbMovieDetails } from '@server/api/themoviedb/interfaces';
import cacheManager, { type NodeCache } from '@server/lib/cache';
import type { LibraryItemsCache } from '@server/lib/collections/core/CollectionUtilities';
import type {
  DiscoveredMoviePlaceholder,
  DiscoveredPlaceholder,
} from '@server/lib/placeholders/services/PlaceholderDiscovery';

/**
 * Centralized cache service for sharing data across sync operations
 * Eliminates repeated API calls during sync by pre-fetching and caching data
 */
export class SyncCacheService {
  private static instance: SyncCacheService;

  private overseerrRequestsCache: OverseerrMediaRequest[] = [];
  private libraryItemsCache: LibraryItemsCache = {};
  private tmdbFranchiseCache: NodeCache =
    cacheManager.getCache('tmdb-franchise').data;
  private placeholderDiscoveryCacheTv: DiscoveredPlaceholder[] = [];
  private placeholderDiscoveryCacheMovies: DiscoveredMoviePlaceholder[] = [];
  private isInitialized = false;

  public static getInstance(): SyncCacheService {
    if (!SyncCacheService.instance) {
      SyncCacheService.instance = new SyncCacheService();
    }
    return SyncCacheService.instance;
  }

  /**
   * Initialize the cache with pre-fetched data
   */
  public initialize(
    overseerrRequests: OverseerrMediaRequest[],
    libraryItems: LibraryItemsCache
  ): void {
    this.overseerrRequestsCache = overseerrRequests;
    this.libraryItemsCache = libraryItems;
    this.isInitialized = true;
  }

  /**
   * Initialize placeholder discovery cache
   */
  public setPlaceholderDiscoveryCache(
    tv: DiscoveredPlaceholder[],
    movies: DiscoveredMoviePlaceholder[]
  ): void {
    this.placeholderDiscoveryCacheTv = tv;
    this.placeholderDiscoveryCacheMovies = movies;
  }

  /**
   * Get cached TV placeholder discoveries
   */
  public getPlaceholderDiscoveryCacheTv(): DiscoveredPlaceholder[] {
    return this.placeholderDiscoveryCacheTv;
  }

  /**
   * Get cached movie placeholder discoveries
   */
  public getPlaceholderDiscoveryCacheMovies(): DiscoveredMoviePlaceholder[] {
    return this.placeholderDiscoveryCacheMovies;
  }

  /**
   * Clear all cached data
   */
  public clear(): void {
    this.overseerrRequestsCache = [];
    this.libraryItemsCache = {};
    this.tmdbFranchiseCache.flushAll();
    this.placeholderDiscoveryCacheTv = [];
    this.placeholderDiscoveryCacheMovies = [];
    this.isInitialized = false;
  }

  /**
   * Get cached Overseerr requests
   */
  public getOverseerrRequests(): OverseerrMediaRequest[] {
    return this.overseerrRequestsCache;
  }

  /**
   * Get cached library items
   */
  public getLibraryItems(): LibraryItemsCache {
    return this.libraryItemsCache;
  }

  /**
   * Check if cache is initialized
   */
  public getIsInitialized(): boolean {
    return this.isInitialized;
  }

  /**
   * Get cache status for logging
   */
  public getCacheStatus(): {
    requestsCount: number;
    librariesCount: number;
    isInitialized: boolean;
  } {
    return {
      requestsCount: this.overseerrRequestsCache.length,
      librariesCount: Object.keys(this.libraryItemsCache).length,
      isInitialized: this.isInitialized,
    };
  }

  /**
   * Get TMDB movie details from cache
   * @param tmdbId TMDB movie ID
   * @returns Cached movie details if valid, null if not cached or expired
   */
  public async getTmdbMovieDetails(
    tmdbId: number
  ): Promise<TmdbMovieDetails | undefined> {
    return await this.tmdbFranchiseCache.get<TmdbMovieDetails>(tmdbId);
  }

  /**
   * Cache TMDB movie details with TTL
   * @param tmdbId TMDB movie ID
   * @param data Movie details to cache
   * @param ttlMs Time to live in milliseconds (default: 48 hours)
   */
  public async setTmdbMovieDetails(
    tmdbId: number,
    data: TmdbMovieDetails,
    ttlMs: number = 48 * 60 * 60 * 1000 // 48 hours default
  ): Promise<boolean> {
    return await this.tmdbFranchiseCache.set(tmdbId, data, ttlMs / 1000);
  }

  /**
   * Clear expired TMDB cache entries
   */
  // public cleanExpiredTmdbCache(): number {
  //   const now = Date.now();
  //   let cleaned = 0;
  //   for (const [tmdbId, entry] of this.tmdbFranchiseCache) {
  //     if (entry.expires <= now) {
  //       this.tmdbFranchiseCache.delete(tmdbId);
  //       cleaned++;
  //     }
  //   }
  //   return cleaned;
  // }
}

// Export singleton instance
export const syncCacheService = SyncCacheService.getInstance();
