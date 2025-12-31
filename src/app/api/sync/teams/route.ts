/**
 * POST /api/sync/teams
 * Completely resyncs the Supabase teams table with fresh data from TheSports API
 * 
 * Steps:
 * 1. Fetch teams from Bundesliga standings
 * 2. For each team, fetch details from TheSports team/detail API
 * 3. Clear existing data and insert fresh records
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Season IDs for top leagues
const SEASON_IDS = {
    bundesliga: 'e4wyrn4hg8gq86p',
    premierLeague: 'l965mkyhjpxr1ge',
};

async function fetchTeamDetails(teamId: string): Promise<{ id: string; name: string; logo: string } | null> {
    try {
        const url = `${API_URL}/v1/football/team/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${teamId}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.results) {
            return {
                id: teamId,
                name: data.results.name || data.results.short_name || 'Unknown',
                logo: data.results.logo || '',
            };
        }
        return null;
    } catch {
        return null;
    }
}

async function fetchStandingsTeamIds(seasonId: string): Promise<string[]> {
    try {
        const url = `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`;
        const response = await fetch(url);
        const data = await response.json();

        const tables = data.results?.tables || [];
        const rows = tables[0]?.rows || [];

        return rows.map((row: any) => row.team_id as string);
    } catch {
        return [];
    }
}

export async function POST() {
    try {
        const logs: string[] = [];
        const teamsToInsert: { id: string; name: string; logo: string }[] = [];

        // Step 1: Get team IDs from Bundesliga standings
        logs.push('Fetching Bundesliga team IDs...');
        const bundesligaTeamIds = await fetchStandingsTeamIds(SEASON_IDS.bundesliga);
        logs.push(`Found ${bundesligaTeamIds.length} Bundesliga teams`);

        // Step 2: Get team IDs from Premier League standings
        logs.push('Fetching Premier League team IDs...');
        const plTeamIds = await fetchStandingsTeamIds(SEASON_IDS.premierLeague);
        logs.push(`Found ${plTeamIds.length} Premier League teams`);

        // Combine and dedupe
        const allTeamIds = [...new Set([...bundesligaTeamIds, ...plTeamIds])];
        logs.push(`Total unique teams to sync: ${allTeamIds.length}`);

        // Step 3: Fetch details for each team
        logs.push('Fetching team details from TheSports API...');
        for (const teamId of allTeamIds) {
            const team = await fetchTeamDetails(teamId);
            if (team) {
                teamsToInsert.push(team);
            }
        }
        logs.push(`Fetched ${teamsToInsert.length} team details`);

        // Step 4: Clear existing teams and insert new ones
        logs.push('Clearing existing teams from Supabase...');

        // Delete only the teams we're about to insert (to avoid deleting all 77k teams)
        const { error: deleteError } = await supabase
            .from('teams')
            .delete()
            .in('id', allTeamIds);

        if (deleteError) {
            logs.push(`Delete error: ${deleteError.message}`);
        } else {
            logs.push(`Deleted old records for ${allTeamIds.length} teams`);
        }

        // Insert fresh data
        logs.push('Inserting fresh team data...');
        const { error: insertError } = await supabase
            .from('teams')
            .upsert(teamsToInsert, { onConflict: 'id' });

        if (insertError) {
            logs.push(`Insert error: ${insertError.message}`);
            return NextResponse.json({
                success: false,
                error: insertError.message,
                logs,
            }, { status: 500 });
        }

        logs.push(`Successfully inserted/updated ${teamsToInsert.length} teams`);

        // Return summary
        return NextResponse.json({
            success: true,
            summary: {
                bundesligaTeams: bundesligaTeamIds.length,
                premierLeagueTeams: plTeamIds.length,
                totalUnique: allTeamIds.length,
                inserted: teamsToInsert.length,
            },
            teams: teamsToInsert.map(t => ({ id: t.id, name: t.name, hasLogo: !!t.logo })),
            logs,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
