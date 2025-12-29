/**
 * GET /api/cron/sync-reference-data
 * Syncs reference data (competitions, countries, teams) from TheSports API cache to Supabase
 * Should be called after cache is loaded, typically after sync-daily
 */

import { supabase } from '@/lib/supabase';
import {
    ensureCachesLoaded,
    getCacheStats,
    getCompetitionById,
    getCountryById,
    getTeamById
} from '@/services/cache';
import { NextResponse } from 'next/server';

// TOP LEAGUES to sync - must match sync-service.ts
const TOP_LEAGUE_IDS = [
    'jednm9whz0ryox8', // Premier League
    'l965mkyh32r1ge4', // Championship
    'gy0or5jhg6qwzv3', // Bundesliga
    'vl7oqdehlyr510j', // La Liga
    '4zp5rzghp5q82w1', // Serie A
    'yl5ergphnzr8k0o', // Ligue 1
    'vl7oqdeheyr510j', // Eredivisie
    '9vjxm8ghx2r6odg', // Primeira Liga
    'z8yomo4h7wq0j6l', // Champions League
    '56ypq3nh0xmd7oj', // Europa League
    'p4jwq2gh754m0ve', // Conference League
];

export async function GET() {
    try {
        console.log('[SyncRef] Starting reference data sync...');

        // 1. Load caches from TheSports API
        await ensureCachesLoaded();
        const cacheStats = getCacheStats();
        console.log(`[SyncRef] Cache loaded: ${cacheStats.teams} teams, ${cacheStats.competitions} competitions, ${cacheStats.countries} countries`);

        let competitionsSynced = 0;
        let countriesSynced = 0;
        let teamsSynced = 0;
        let errors = 0;

        // 2. Sync TOP LEAGUE competitions
        console.log('[SyncRef] Syncing competitions...');
        const countryIds = new Set<string>();

        for (const compId of TOP_LEAGUE_IDS) {
            const comp = getCompetitionById(compId);
            if (!comp) {
                console.warn(`[SyncRef] Competition ${compId} not found in cache`);
                continue;
            }

            // Collect country IDs for later sync
            if (comp.country_id) {
                countryIds.add(comp.country_id);
            }

            const { error } = await supabase.from('competitions').upsert({
                id: comp.id,
                name: comp.name,
                short_name: comp.short_name || null,
                logo: comp.logo || null,
                country_id: comp.country_id || null,
                type: comp.type?.toString() || null,
                primary_color: comp.primary_color || null,
                secondary_color: comp.secondary_color || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            if (error) {
                console.error(`[SyncRef] Competition ${comp.id} error:`, error.message);
                errors++;
            } else {
                competitionsSynced++;
            }
        }

        // 3. Sync countries referenced by competitions
        console.log('[SyncRef] Syncing countries...');
        for (const countryId of countryIds) {
            const country = getCountryById(countryId);
            if (!country) continue;

            const { error } = await supabase.from('countries').upsert({
                id: country.id,
                name: country.name,
                logo: country.logo || null,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });

            if (error) {
                console.error(`[SyncRef] Country ${country.id} error:`, error.message);
                errors++;
            } else {
                countriesSynced++;
            }
        }

        // 4. Sync teams from recent matches
        console.log('[SyncRef] Syncing teams from recent matches...');

        // Get team IDs from matches synced in last 24 hours
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        const { data: recentMatches } = await supabase
            .from('matches')
            .select('home_team_id, away_team_id')
            .gte('updated_at', yesterday.toISOString())
            .limit(500);

        if (recentMatches) {
            const teamIds = new Set<string>();
            recentMatches.forEach(m => {
                if (m.home_team_id) teamIds.add(m.home_team_id);
                if (m.away_team_id) teamIds.add(m.away_team_id);
            });

            console.log(`[SyncRef] Found ${teamIds.size} unique teams from recent matches`);

            for (const teamId of teamIds) {
                const team = getTeamById(teamId);
                if (!team) continue;

                const { error } = await supabase.from('teams').upsert({
                    id: team.id,
                    name: team.name,
                    short_name: team.short_name || null,
                    logo: team.logo || null,
                    country_id: team.country_id || null,
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'id' });

                if (error) {
                    console.error(`[SyncRef] Team ${team.id} error:`, error.message);
                    errors++;
                } else {
                    teamsSynced++;
                }
            }
        }

        console.log(`[SyncRef] Complete: ${competitionsSynced} competitions, ${countriesSynced} countries, ${teamsSynced} teams, ${errors} errors`);

        return NextResponse.json({
            success: true,
            synced: {
                competitions: competitionsSynced,
                countries: countriesSynced,
                teams: teamsSynced,
            },
            errors,
            cacheStats,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('[SyncRef] Error:', error);
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 1 minute timeout
