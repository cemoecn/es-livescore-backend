/**
 * GET /api/leagues/[id]/standings
 * Returns full standings for a league using TheSports API
 * 1. Fetches competition detail to get cur_season_id
 * 2. Fetches table for that season
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Hardcoded fallback for season IDs if API fails
const SEASON_ID_MAP: Record<string, string> = {
    // 'gy0or5jhg6qwzv3': '...', // Add if found manually
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: leagueId } = await params;

        let curSeasonId: string | undefined = SEASON_ID_MAP[leagueId];
        let curRound: string | undefined;
        let standingsRows: any[] = [];
        let source = 'unknown';

        // Step 1: Try to get competition details (if not hardcoded)
        if (!curSeasonId) {
            try {
                const compResponse = await fetch(
                    `${API_URL}/v1/football/competition/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${leagueId}`
                );
                const compData = await compResponse.json();

                const competition = compData.results || compData.data;
                // Check if we got valid data or error
                if (competition && competition.cur_season_id) {
                    curSeasonId = competition.cur_season_id;
                    curRound = competition.cur_round;
                } else {
                    console.warn(`[Standings] Competition detail request failed or empty for ${leagueId}:`, JSON.stringify(compData).slice(0, 100));
                }
            } catch (e) {
                console.warn(`[Standings] Exception fetching competition detail: ${e}`);
            }
        }

        // Step 2: If we have a Season ID, fetch full table
        if (curSeasonId) {
            try {
                console.log(`[Standings] Fetching table for season ${curSeasonId}`);
                const tableResponse = await fetch(
                    `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${curSeasonId}`
                );
                const tableData = await tableResponse.json();

                // Parse response (can be array or object depending on endpoint version/doc)
                // usually: results -> { tables: [ { rows: [] } ] } or results -> [ { rows: [] } ]
                const result = tableData.results || tableData.data;

                if (Array.isArray(result)) {
                    standingsRows = result[0]?.rows || [];
                } else if (result?.tables) {
                    standingsRows = result.tables[0]?.rows || [];
                } else if (result?.rows) {
                    standingsRows = result.rows;
                }

                if (standingsRows.length > 0) source = 'season_table';
            } catch (e) {
                console.warn(`[Standings] Exception fetching season table: ${e}`);
            }
        }

        // Step 3: Fallback - Try Live Table if we still have no rows
        if (standingsRows.length === 0) {
            console.log(`[Standings] Fallback to /table/live for ${leagueId}`);
            try {
                const liveResponse = await fetch(
                    `${API_URL}/v1/football/table/live?user=${USERNAME}&secret=${API_KEY}&competition_id=${leagueId}`
                );
                const liveData = await liveResponse.json();
                const tables = liveData.results || liveData.data || [];

                // Usually returns array of tables (e.g. for different groups), take first for league
                if (Array.isArray(tables) && tables.length > 0) {
                    standingsRows = tables[0]?.rows || [];
                    if (!curSeasonId && tables[0]?.season_id) {
                        curSeasonId = tables[0].season_id;
                    }
                }
                if (standingsRows.length > 0) source = 'live_table';
            } catch (e) {
                console.warn(`[Standings] Exception fetching live table: ${e}`);
            }
        }

        if (standingsRows.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'Could not find standings (auth error or no data)',
                debug: { leagueId, curSeasonId, source }
            }, { status: 404 });
        }

        // Step 4: Enrich with Supabase Team Data
        // Collect team IDs (map from potential field names)
        const teamIds = standingsRows.map((r: any) => r.team_id || r.team?.id).filter(Boolean);

        let teamMap = new Map<string, { name: string, logo: string }>();
        if (teamIds.length > 0) {
            const { data: teams } = await supabase
                .from('teams')
                .select('id, name, logo')
                .in('id', teamIds);

            teams?.forEach(t => teamMap.set(t.id, t));
        }

        // Step 5: Format Response
        const standings = standingsRows.map((row: any, idx: number) => {
            const teamId = row.team_id || row.team?.id;
            const teamInfo = teamMap.get(teamId);

            // Handle various field names from different APIs
            const position = row.position || idx + 1;
            const played = row.total || row.matches_total || row.played || 0;
            const won = row.won || row.matches_won || 0;
            const drawn = row.draw || row.matches_draw || 0;
            const lost = row.loss || row.matches_lost || 0;
            const goalsFor = row.goals || row.goals_pro || row.goals_for || 0;
            const goalsAgainst = row.goals_against || 0;
            const points = row.points || 0;

            return {
                position,
                team_id: teamId,
                team: teamInfo?.name || row.team_name || (row.team ? row.team.name : `Team ${teamId}`),
                logo: teamInfo?.logo || row.team_logo || (row.team ? row.team.logo : ''),
                played,
                won,
                drawn,
                lost,
                goalsFor,
                goalsAgainst,
                goalDiff: goalsFor - goalsAgainst,
                points,
                zone: getZone(position, standingsRows.length),
            };
        });

        // Sort just in case
        standings.sort((a: any, b: any) => a.position - b.position);

        return NextResponse.json({
            success: true,
            data: {
                competition_id: leagueId,
                season_id: curSeasonId || 'unknown',
                source,
                standings,
            },
        });

    } catch (error) {
        console.error('Error fetching standings:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

// Helper to determine zone based on position
function getZone(position: number, totalTeams: number): string | undefined {
    if (position <= 4) return 'cl';
    if (position === 5) return 'el';
    if (position === 6) return 'ecl';
    if (position >= totalTeams - 2) return 'relegation';
    return undefined;
}

export const dynamic = 'force-dynamic';
