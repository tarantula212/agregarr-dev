import KeyvSqlite from '@keyv/sqlite';
import fs from 'fs';
import Keyv from 'keyv';
import path from 'path';

export type AvailableCacheIds =
  | 'tmdb'
  | 'tvdb'
  | 'radarr'
  | 'sonarr'
  | 'rt'
  | 'imdb'
  | 'imdb-ratings' // Per-item IMDb ratings with adaptive TTL based on content age
  | 'rt-ratings' // Per-item RT ratings with adaptive TTL based on content age
  | 'tmdb-releases' // Per-item TMDB release date info with adaptive TTL
  | 'tmdb-franchise' // Per-item TMDB franchise info with adaptive TTL
  | 'flixpatrol'
  | 'github'
  | 'plexguid'
  | 'plextv'
  | 'plexwatchlist'
  | 'trakt-list'
  | 'imdb-list'
  | 'letterboxd-list'
  | 'tmdb-list'
  | 'mdblist-list'
  | 'tautulli-list'
  | 'overseerr-list'
  | 'networks-list'
  | 'originals-list'
  | 'anilist-list'
  | 'myanimelist-list';

const DEFAULT_TTL = 300;

const CACHE_DIR = path.join(process.cwd(), 'config', 'cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR);
}

export class NodeCache {
  private _keyv: Keyv;
  private _stdTtl: number;

  constructor({ stdTtl, id }: { stdTtl: number; id: string }) {
    this._stdTtl = stdTtl;
    const keyvSqlite = new KeyvSqlite({
      uri: `sqlite://${path.join(CACHE_DIR, 'cache.sqlite')}`,
      table: id,
      keySize: 8094,
    });
    this._keyv = new Keyv({ store: keyvSqlite, stats: true });
  }

  public async set<T>(
    key: string | number,
    value: T,
    ttl?: number
  ): Promise<boolean> {
    const ttl_msec = (ttl ?? this._stdTtl) * 1000;
    return await this._keyv.set<T>(key.toString(), value, ttl_msec);
  }

  public async get<T>(key: string | number): Promise<T | undefined> {
    const result = await this._keyv.get<T>(key.toString());
    if (!result) {
      return;
    }

    return result;
  }

  public async getTtl(key: string | number): Promise<number | undefined> {
    const result = await this._keyv.getRaw(key.toString());
    if (!result) {
      return;
    }
    return result.expires;
  }

  public async flushAll(): Promise<void> {
    await this._keyv.clear();
  }

  public getStats(): {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
  } {
    const stats = this._keyv.stats;
    return {
      hits: stats.hits,
      misses: stats.misses,
      sets: stats.sets,
      deletes: stats.deletes,
      errors: stats.errors,
    };
  }
}

class Cache {
  public id: AvailableCacheIds;
  public data: NodeCache;
  public name: string;

  constructor(
    id: AvailableCacheIds,
    name: string,
    options: { stdTtl?: number } = {}
  ) {
    this.id = id;
    this.name = name;
    this.data = new NodeCache({
      stdTtl: options.stdTtl ?? DEFAULT_TTL,
      id,
    });
  }

  public getStats() {
    return this.data.getStats();
  }

  public async flush(): Promise<void> {
    return await this.data.flushAll();
  }
}

class CacheManager {
  private availableCaches: Record<AvailableCacheIds, Cache> = {
    tmdb: new Cache('tmdb', 'The Movie Database API', {
      stdTtl: 21600,
    }),
    tvdb: new Cache('tvdb', 'TVDB API', {
      stdTtl: 21600,
    }),
    radarr: new Cache('radarr', 'Radarr API'),
    sonarr: new Cache('sonarr', 'Sonarr API'),
    rt: new Cache('rt', 'Rotten Tomatoes API', {
      stdTtl: 43200,
    }),
    imdb: new Cache('imdb', 'IMDB Radarr Proxy', {
      stdTtl: 43200,
    }),
    // Per-item IMDb ratings cache with adaptive TTL based on content age
    // TTL is set per-item: 12h for new releases, 3 days for recent, 7 days for older
    // Using 7-day default as items are set with explicit TTL
    'imdb-ratings': new Cache('imdb-ratings', 'IMDb Ratings (Adaptive TTL)', {
      stdTtl: 86400 * 7, // 7 day default (individual items use explicit TTL)
    }),
    // Per-item RT ratings cache with adaptive TTL based on content age
    // Same TTL strategy as IMDb: longer cache for older content
    'rt-ratings': new Cache('rt-ratings', 'RT Ratings (Adaptive TTL)', {
      stdTtl: 86400 * 7, // 7 day default (individual items use explicit TTL)
    }),
    // Per-item TMDB release date info cache with adaptive TTL
    // Release dates change infrequently; cache longer for older content
    'tmdb-releases': new Cache(
      'tmdb-releases',
      'TMDB Release Dates (Adaptive TTL)',
      {
        stdTtl: 86400 * 7, // 7 day default (individual items use explicit TTL)
      }
    ),
    'tmdb-franchise': new Cache(
      'tmdb-franchise',
      'TMDB Franchise Data (Adaptive TTL)',
      {
        stdTtl: 86400 * 2, // 2 day default (individual items use explicit TTL)
      }
    ),
    flixpatrol: new Cache('flixpatrol', 'FlixPatrol API', {
      stdTtl: 3600, // 1 hour cache for streaming top 10 data
    }),
    github: new Cache('github', 'GitHub API', {
      stdTtl: 21600,
    }),
    plexguid: new Cache('plexguid', 'Plex GUID', {
      stdTtl: 86400 * 7, // 1 week cache
    }),
    plextv: new Cache('plextv', 'Plex TV', {
      stdTtl: 86400 * 7, // 1 week cache
    }),
    plexwatchlist: new Cache('plexwatchlist', 'Plex Watchlist'),
    // List caches - cache external list data between syncs for faster preview
    // 7-day TTL as safety net (syncs normally refresh cache long before expiration)
    'trakt-list': new Cache('trakt-list', 'Trakt Lists', {
      stdTtl: 86400 * 7, // 7 day cache - safety net if syncs stop
    }),
    'imdb-list': new Cache('imdb-list', 'IMDb Lists', {
      stdTtl: 86400 * 7, // 7 day cache
    }),
    'letterboxd-list': new Cache('letterboxd-list', 'Letterboxd Lists', {
      stdTtl: 86400 * 7, // 7 day cache
    }),
    'tmdb-list': new Cache('tmdb-list', 'TMDb Lists', {
      stdTtl: 86400 * 7, // 7 day cache
    }),
    'mdblist-list': new Cache('mdblist-list', 'MDBList Lists', {
      stdTtl: 86400 * 7, // 7 day cache
    }),
    'tautulli-list': new Cache('tautulli-list', 'Tautulli Stats', {
      stdTtl: 86400 * 7, // 7 day cache
    }),
    'overseerr-list': new Cache('overseerr-list', 'Overseerr Requests', {
      stdTtl: 86400 * 7, // 7 day cache
    }),
    'networks-list': new Cache('networks-list', 'Network Top 10', {
      stdTtl: 86400 * 7, // 7 day cache
    }),
    'originals-list': new Cache('originals-list', 'Provider Originals', {
      stdTtl: 86400 * 7, // 7 day cache
    }),
    'anilist-list': new Cache('anilist-list', 'AniList Lists', {
      stdTtl: 86400 * 7, // 7 day cache
    }),
    'myanimelist-list': new Cache('myanimelist-list', 'MyAnimeList Lists', {
      stdTtl: 86400 * 7, // 7 day cache
    }),
  };

  public getCache(id: AvailableCacheIds): Cache {
    return this.availableCaches[id];
  }

  public getAllCaches(): Record<string, Cache> {
    return this.availableCaches;
  }
}

const cacheManager = new CacheManager();

export default cacheManager;
