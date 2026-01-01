/**
 * POST /api/admin/sync-players
 * Syncs player data from TheSports API to Supabase
 * 
 * Note: TheSports API provides player data differently:
 * - /v1/football/team/squad/list - Squad list per team
 * - /v1/football/player/additional/list - All players (paginated)
 * 
 * This endpoint uses the paginated list for full sync.
 * 
 * Query params:
 * - pages: max pages to fetch (default: 200, each page ~1000 players)
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

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
        console.error(`[SyncPlayers] Error fetching page ${page}:`, error);
        return [];
    }
}

export async function POST(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const maxPages = parseInt(searchParams.get('pages') || '200', 10);

    console.log(`[SyncPlayers] Starting sync maxPages=${maxPages}`);
    const startTime = Date.now();

    try {
        let totalFetched = 0;
        let totalInserted = 0;
        let totalErrors = 0;
        let lastError = '';

        for (let page = 1; page <= maxPages; page++) {
            const players = await fetchPage<any>('/v1/football/player/with_stat/list', page);

            if (players.length === 0) {
                console.log(`[SyncPlayers] Stopped at page ${page} (empty)`);
                break;
            }

            totalFetched += players.length;

            // Batch upsert
            const batch = players.map(p => ({
                id: p.id,
                name: p.name || p.name_en || 'Unknown Player',
                short_name: p.short_name || null,
                team_id: p.team_id || null,
                position: p.position || p.position_name || null,
                nationality: p.nationality || p.country_name || null,
                birth_date: p.birthday || p.birth_date || null,
                photo: p.logo || p.photo || null,
                jersey_number: p.shirt_number || p.jersey_number || null,
                market_value: p.market_value || null,
                updated_at: new Date().toISOString(),
            }));

            const { error } = await supabase.from('players').upsert(batch, { onConflict: 'id' });

            if (error) {
                console.error(`[SyncPlayers] Batch ${page} error:`, error.message);
                lastError = error.message;
                totalErrors++;
            } else {
                totalInserted += batch.length;
            }

            // Progress log every 10 pages
            if (page % 10 === 0) {
                console.log(`[SyncPlayers] Progress: ${page} pages, ${totalFetched} players`);
            }
        }

        const duration = Date.now() - startTime;

        return NextResponse.json({
            success: true,
            summary: {
                fetched: totalFetched,
                inserted: totalInserted,
                errors: totalErrors,
                lastError: lastError || null,
                duration,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[SyncPlayers] Fatal error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    return POST(request);
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes
