/**
 * Cache Service for Reference Data
 * Caches teams, competitions, and countries for fast lookup during match enrichment
 */

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Cache storage
interface CacheEntry<T> {
    data: Map<string, T>;
    lastUpdated: number;
    isLoading: boolean;
}

// Team type from TheSports API
export interface CachedTeam {
    id: string;
    name: string;
    short_name: string;
    logo: string;
    country_id: string;
    national: number;
}

// Competition type from TheSports API
export interface CachedCompetition {
    id: string;
    name: string;
    short_name: string;
    logo: string;
    country_id: string;
    type: number;
    primary_color: string;
    secondary_color: string;
}

// Country type from TheSports API
export interface CachedCountry {
    id: string;
    name: string;
    logo: string;
}

// Cache instances
const teamsCache: CacheEntry<CachedTeam> = {
    data: new Map(),
    lastUpdated: 0,
    isLoading: false,
};

const competitionsCache: CacheEntry<CachedCompetition> = {
    data: new Map(),
    lastUpdated: 0,
    isLoading: false,
};

const countriesCache: CacheEntry<CachedCountry> = {
    data: new Map(),
    lastUpdated: 0,
    isLoading: false,
};

// Cache expiry time (1 hour)
const CACHE_TTL = 60 * 60 * 1000;

/**
 * Fetch data from API with pagination support
 */
async function fetchAllPages<T>(
    endpoint: string,
    maxPages: number = 10
): Promise<T[]> {
    const allResults: T[] = [];

    for (let page = 1; page <= maxPages; page++) {
        const url = `${API_URL}${endpoint}?user=${USERNAME}&secret=${API_KEY}&page=${page}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
            });

            if (!response.ok) break;

            const data = await response.json();

            if (data.err) {
                console.error(`Cache fetch error for ${endpoint}:`, data.err);
                break;
            }

            const results = data.data?.results || data.results || [];
            if (results.length === 0) break;

            allResults.push(...results);

            // If we got less than expected, we're done
            if (results.length < 1000) break;
        } catch (error) {
            console.error(`Cache fetch error for ${endpoint}:`, error);
            break;
        }
    }

    return allResults;
}

/**
 * Load teams into cache
 */
export async function loadTeamsCache(): Promise<void> {
    if (teamsCache.isLoading) return;

    const now = Date.now();
    if (teamsCache.data.size > 0 && (now - teamsCache.lastUpdated) < CACHE_TTL) {
        return; // Cache is still valid
    }

    teamsCache.isLoading = true;
    console.log('[Cache] Loading teams...');

    try {
        // Load teams with more pages to get all teams
        const allTeams: CachedTeam[] = [];

        for (let page = 1; page <= 100; page++) {
            const url = `${API_URL}/v1/football/team/additional/list?user=${USERNAME}&secret=${API_KEY}&page=${page}`;

            try {
                const response = await fetch(url, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                });

                if (!response.ok) {
                    console.log(`[Cache] Teams page ${page}: HTTP ${response.status}`);
                    break;
                }

                const data = await response.json();

                if (data.err) {
                    console.log(`[Cache] Teams page ${page}: Error - ${data.err}`);
                    break;
                }

                // Handle different response formats
                const results = data.results || data.data?.results || [];

                if (results.length === 0) {
                    console.log(`[Cache] Teams page ${page}: No more results`);
                    break;
                }

                allTeams.push(...results);

                if (page === 1) {
                    console.log(`[Cache] Teams page 1: Got ${results.length} teams, sample: ${results[0]?.name}`);
                }

                // If we got less than 1000, we're done
                if (results.length < 1000) break;
            } catch (e) {
                console.log(`[Cache] Teams page ${page}: Fetch error - ${e}`);
                break;
            }
        }

        teamsCache.data.clear();
        allTeams.forEach(team => {
            teamsCache.data.set(team.id, team);
        });

        teamsCache.lastUpdated = now;
        console.log(`[Cache] Loaded ${teamsCache.data.size} teams total`);
    } catch (error) {
        console.error('[Cache] Failed to load teams:', error);
    } finally {
        teamsCache.isLoading = false;
    }
}

/**
 * Load competitions into cache
 */
export async function loadCompetitionsCache(): Promise<void> {
    if (competitionsCache.isLoading) return;

    const now = Date.now();
    if (competitionsCache.data.size > 0 && (now - competitionsCache.lastUpdated) < CACHE_TTL) {
        return;
    }

    competitionsCache.isLoading = true;
    console.log('[Cache] Loading competitions...');

    try {
        const competitions = await fetchAllPages<CachedCompetition>('/v1/football/competition/additional/list', 5);

        competitionsCache.data.clear();
        competitions.forEach(comp => {
            competitionsCache.data.set(comp.id, comp);
        });

        competitionsCache.lastUpdated = now;
        console.log(`[Cache] Loaded ${competitionsCache.data.size} competitions`);
    } catch (error) {
        console.error('[Cache] Failed to load competitions:', error);
    } finally {
        competitionsCache.isLoading = false;
    }
}

/**
 * Load countries into cache
 */
export async function loadCountriesCache(): Promise<void> {
    if (countriesCache.isLoading) return;

    const now = Date.now();
    if (countriesCache.data.size > 0 && (now - countriesCache.lastUpdated) < CACHE_TTL) {
        return;
    }

    countriesCache.isLoading = true;
    console.log('[Cache] Loading countries...');

    try {
        const countries = await fetchAllPages<CachedCountry>('/v1/football/country/list', 1);

        countriesCache.data.clear();
        countries.forEach(country => {
            countriesCache.data.set(country.id, country);
        });

        countriesCache.lastUpdated = now;
        console.log(`[Cache] Loaded ${countriesCache.data.size} countries`);
    } catch (error) {
        console.error('[Cache] Failed to load countries:', error);
    } finally {
        countriesCache.isLoading = false;
    }
}

/**
 * Initialize all caches (call on server start)
 */
export async function initializeCache(): Promise<void> {
    console.log('[Cache] Initializing all caches...');
    await Promise.all([
        loadTeamsCache(),
        loadCompetitionsCache(),
        loadCountriesCache(),
    ]);
    console.log('[Cache] All caches initialized');
}

/**
 * Get team by ID
 */
export function getTeamById(teamId: string): CachedTeam | undefined {
    return teamsCache.data.get(teamId);
}

/**
 * Get competition by ID
 */
export function getCompetitionById(competitionId: string): CachedCompetition | undefined {
    return competitionsCache.data.get(competitionId);
}

/**
 * Get country by ID
 */
export function getCountryById(countryId: string): CachedCountry | undefined {
    return countriesCache.data.get(countryId);
}

/**
 * Ensure caches are loaded (lazy load)
 */
export async function ensureCachesLoaded(): Promise<void> {
    const promises: Promise<void>[] = [];

    if (teamsCache.data.size === 0) {
        promises.push(loadTeamsCache());
    }
    if (competitionsCache.data.size === 0) {
        promises.push(loadCompetitionsCache());
    }
    if (countriesCache.data.size === 0) {
        promises.push(loadCountriesCache());
    }

    if (promises.length > 0) {
        await Promise.all(promises);
    }
}

/**
 * Reset all caches (hard reset)
 */
export function resetAllCaches(): void {
    console.log('[Cache] Performing hard reset of all caches...');

    teamsCache.data.clear();
    teamsCache.lastUpdated = 0;
    teamsCache.isLoading = false;

    competitionsCache.data.clear();
    competitionsCache.lastUpdated = 0;
    competitionsCache.isLoading = false;

    countriesCache.data.clear();
    countriesCache.lastUpdated = 0;
    countriesCache.isLoading = false;

    console.log('[Cache] All caches cleared');
}

/**
 * Get cache stats
 */
export function getCacheStats() {
    return {
        teams: teamsCache.data.size,
        competitions: competitionsCache.data.size,
        countries: countriesCache.data.size,
        teamsAge: Date.now() - teamsCache.lastUpdated,
        competitionsAge: Date.now() - competitionsCache.lastUpdated,
        countriesAge: Date.now() - countriesCache.lastUpdated,
    };
}

export const CacheService = {
    initializeCache,
    ensureCachesLoaded,
    loadTeamsCache,
    loadCompetitionsCache,
    loadCountriesCache,
    getTeamById,
    getCompetitionById,
    getCountryById,
    getCacheStats,
    resetAllCaches,
};

export default CacheService;
