/**
 * POST /api/admin/sync-all
 * Master endpoint for complete data synchronization from TheSports API to Supabase
 * Syncs: Countries → Competitions → Teams → Seasons (in order due to FK dependencies)
 * 
 * Query params:
 * - type: "countries" | "competitions" | "teams" | "seasons" | "all" (default: "all")
 * - pages: number - max pages to fetch for paginated endpoints (default: 100)
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

interface SyncResult {
    type: string;
    fetched: number;
    inserted: number;
    errors: number;
    duration: number;
}

// ============================================================================
// API FETCH HELPERS
// ============================================================================

async function fetchPage<T>(endpoint: string, page: number): Promise<T[]> {
    try {
        const url = `${API_URL}${endpoint}?user=${USERNAME}&secret=${API_KEY}&page=${page}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === 0 && data.results) {
            return Array.isArray(data.results) ? data.results : [];
        }
        return [];
    } catch (error) {
        console.error(`[SyncAll] Error fetching ${endpoint} page ${page}:`, error);
        return [];
    }
}

async function fetchAllPages<T>(endpoint: string, maxPages: number): Promise<T[]> {
    const allResults: T[] = [];

    for (let page = 1; page <= maxPages; page++) {
        const results = await fetchPage<T>(endpoint, page);
        if (results.length === 0) {
            console.log(`[SyncAll] ${endpoint}: Stopped at page ${page} (empty)`);
            break;
        }
        allResults.push(...results);
        console.log(`[SyncAll] ${endpoint}: Page ${page} fetched ${results.length} items (total: ${allResults.length})`);
    }

    return allResults;
}

// ============================================================================
// SYNC FUNCTIONS
// ============================================================================

async function syncCountries(): Promise<SyncResult> {
    const start = Date.now();
    console.log('[SyncAll] Starting countries sync...');

    // Countries are usually on a single page
    const countries = await fetchAllPages<any>('/v1/football/country/list', 5);

    let inserted = 0;
    let errors = 0;

    // Batch upsert in chunks of 100
    const BATCH_SIZE = 100;
    for (let i = 0; i < countries.length; i += BATCH_SIZE) {
        const batch = countries.slice(i, i + BATCH_SIZE).map(c => ({
            id: c.id,
            name: c.name || c.name_en || 'Unknown',
            logo: c.logo || null,
            continent: c.continent || null,
            updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from('countries').upsert(batch, { onConflict: 'id' });

        if (error) {
            console.error(`[SyncAll] Countries batch error:`, error.message);
            errors++;
        } else {
            inserted += batch.length;
        }
    }

    return {
        type: 'countries',
        fetched: countries.length,
        inserted,
        errors,
        duration: Date.now() - start,
    };
}

async function syncCompetitions(maxPages: number): Promise<SyncResult> {
    const start = Date.now();
    console.log('[SyncAll] Starting competitions sync...');

    const competitions = await fetchAllPages<any>('/v1/football/competition/additional/list', maxPages);

    let inserted = 0;
    let errors = 0;

    // Top 5 European leagues get priority
    const TOP_LEAGUES: Record<string, number> = {
        'jednm9whz0ryox8': 1, // Premier League
        'gy0or5jhg6qwzv3': 2, // Bundesliga
        'vl7oqdehlyr510j': 3, // La Liga
        '4zp5rzghp5q82w1': 4, // Serie A
        'yl5ergphnzr8k0o': 5, // Ligue 1
    };

    const BATCH_SIZE = 100;
    for (let i = 0; i < competitions.length; i += BATCH_SIZE) {
        const batch = competitions.slice(i, i + BATCH_SIZE).map(c => ({
            id: c.id,
            name: c.name || c.name_en || 'Unknown',
            short_name: c.short_name || null,
            logo: c.logo || null,
            country_id: c.country_id || null,
            type: c.type?.toString() || null,
            priority: TOP_LEAGUES[c.id] || 999,
            primary_color: c.primary_color || null,
            secondary_color: c.secondary_color || null,
            updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from('competitions').upsert(batch, { onConflict: 'id' });

        if (error) {
            console.error(`[SyncAll] Competitions batch error:`, error.message);
            errors++;
        } else {
            inserted += batch.length;
        }
    }

    return {
        type: 'competitions',
        fetched: competitions.length,
        inserted,
        errors,
        duration: Date.now() - start,
    };
}

async function syncTeams(maxPages: number): Promise<SyncResult> {
    const start = Date.now();
    console.log('[SyncAll] Starting teams sync...');

    const teams = await fetchAllPages<any>('/v1/football/team/additional/list', maxPages);

    let inserted = 0;
    let errors = 0;

    const BATCH_SIZE = 500;
    for (let i = 0; i < teams.length; i += BATCH_SIZE) {
        const batch = teams.slice(i, i + BATCH_SIZE).map(t => ({
            id: t.id,
            name: t.name || t.name_en || 'Unknown Team',
            short_name: t.short_name || null,
            logo: t.logo || null,
            country_id: t.country_id || null,
            founded: t.founded || null,
            venue: t.venue || t.venue_name || null,
            updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from('teams').upsert(batch, { onConflict: 'id' });

        if (error) {
            console.error(`[SyncAll] Teams batch ${i / BATCH_SIZE + 1} error:`, error.message);
            errors++;
        } else {
            inserted += batch.length;
        }
    }

    return {
        type: 'teams',
        fetched: teams.length,
        inserted,
        errors,
        duration: Date.now() - start,
    };
}

async function syncSeasons(maxPages: number): Promise<SyncResult> {
    const start = Date.now();
    console.log('[SyncAll] Starting seasons sync...');

    const seasons = await fetchAllPages<any>('/v1/football/season/list', maxPages);

    let inserted = 0;
    let errors = 0;

    const BATCH_SIZE = 200;
    for (let i = 0; i < seasons.length; i += BATCH_SIZE) {
        const batch = seasons.slice(i, i + BATCH_SIZE).map(s => ({
            id: s.id,
            competition_id: s.competition_id || null,
            name: s.name || s.year?.toString() || 'Unknown Season',
            year: s.year || null,
            is_current: s.is_current || false,
            start_date: s.start_date || null,
            end_date: s.end_date || null,
            updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase.from('seasons').upsert(batch, { onConflict: 'id' });

        if (error) {
            console.error(`[SyncAll] Seasons batch error:`, error.message);
            errors++;
        } else {
            inserted += batch.length;
        }
    }

    return {
        type: 'seasons',
        fetched: seasons.length,
        inserted,
        errors,
        duration: Date.now() - start,
    };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const type = searchParams.get('type') || 'all';
    const maxPages = parseInt(searchParams.get('pages') || '100', 10);

    console.log(`[SyncAll] Starting sync type="${type}" maxPages=${maxPages}`);
    const startTime = Date.now();

    try {
        const results: SyncResult[] = [];

        // Sync in dependency order: countries → competitions → teams → seasons
        if (type === 'all' || type === 'countries') {
            results.push(await syncCountries());
        }

        if (type === 'all' || type === 'competitions') {
            results.push(await syncCompetitions(maxPages));
        }

        if (type === 'all' || type === 'teams') {
            results.push(await syncTeams(maxPages));
        }

        if (type === 'all' || type === 'seasons') {
            results.push(await syncSeasons(maxPages));
        }

        const totalDuration = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            type,
            results,
            summary: {
                totalFetched: results.reduce((sum, r) => sum + r.fetched, 0),
                totalInserted: results.reduce((sum, r) => sum + r.inserted, 0),
                totalErrors: results.reduce((sum, r) => sum + r.errors, 0),
                totalDuration,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[SyncAll] Fatal error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

// Also support GET for easy testing
export async function GET(request: NextRequest) {
    return POST(request);
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes timeout for large syncs
