/**
 * GET /api/leagues/[id]/standings
 * Returns full standings for a league using TheSports season/recent/table/detail API
 * Team names and logos are fetched from Supabase teams cache (synced from TheSports)
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Current 2025/26 season IDs mapped by competition_id
const CURRENT_SEASON_IDS: Record<string, string> = {
    'gy0or5jhg6qwzv3': 'e4wyrn4hg8gq86p', // Bundesliga 2025/26
    'jednm9whz0ryox8': 'l965mkyhjpxr1ge', // Premier League 2025/26
    'l965mkyh32r1ge4': '56ypq3nhx51md7o', // Championship 2025/26
    'vl7oqdehlyr510j': '56ypq3nhxw7md7o', // La Liga 2025/26
    '4zp5rzghp5q82w1': '4zp5rzghn83q82w', // Serie A 2025/26
    'yl5ergphnzr8k0o': '9dn1m1gh645moep', // Ligue 1 2025/26
    'vl7oqdeheyr510j': 'yl5ergphgo0r8k0', // Eredivisie 2025/26
    '9vjxm8ghx2r6odg': 'kjw2r09h811rz84', // Primeira Liga 2025/26
    'z8yomo4h7wq0j6l': 'z8yomo4hn70q0j6', // Champions League 2025/26
    '56ypq3nh0xmd7oj': 'v2y8m4zhl38ql07', // Europa League 2025/26
};

// Zone configuration per league (positions for CL, EL, ECL, relegation playoff, relegation, promotion)
// Based on 2025/26 season rules
const LEAGUE_ZONES: Record<string, {
    cl: number[];
    el: number[];
    ecl: number[];
    relegation_playoff: number[];
    relegation: number[];
    promotion: number[];
    promotion_playoff: number[];
    eliminated: number[]; // For UEFA competitions
}> = {
    // Bundesliga (18 teams): 1-4 CL, 5 EL, 6 ECL Playoff, 16 Rel Playoff, 17-18 Abstieg
    'gy0or5jhg6qwzv3': {
        cl: [1, 2, 3, 4], el: [5], ecl: [6],
        relegation_playoff: [16], relegation: [17, 18],
        promotion: [], promotion_playoff: [], eliminated: []
    },
    // Premier League (20 teams): 1-4 CL, 5 EL, 6 ECL, 18-20 Abstieg
    'jednm9whz0ryox8': {
        cl: [1, 2, 3, 4], el: [5], ecl: [6],
        relegation_playoff: [], relegation: [18, 19, 20],
        promotion: [], promotion_playoff: [], eliminated: []
    },
    // Championship (24 teams): 1-2 Aufstieg, 3-6 Playoffs, 22-24 Abstieg
    'l965mkyh32r1ge4': {
        cl: [], el: [], ecl: [],
        relegation_playoff: [], relegation: [22, 23, 24],
        promotion: [1, 2], promotion_playoff: [3, 4, 5, 6], eliminated: []
    },
    // La Liga (20 teams): 1-4 CL, 5-6 EL, 7 ECL Playoff, 18-20 Abstieg
    'vl7oqdehlyr510j': {
        cl: [1, 2, 3, 4], el: [5, 6], ecl: [7],
        relegation_playoff: [], relegation: [18, 19, 20],
        promotion: [], promotion_playoff: [], eliminated: []
    },
    // Serie A (20 teams): 1-4 CL, 5 EL, 6 ECL, 18-20 Abstieg
    '4zp5rzghp5q82w1': {
        cl: [1, 2, 3, 4], el: [5], ecl: [6],
        relegation_playoff: [], relegation: [18, 19, 20],
        promotion: [], promotion_playoff: [], eliminated: []
    },
    // Ligue 1 (18 teams): 1-3 CL, 4 EL, 5 ECL Playoff, 16 Rel Playoff, 17-18 Abstieg
    'yl5ergphnzr8k0o': {
        cl: [1, 2, 3], el: [4], ecl: [5],
        relegation_playoff: [16], relegation: [17, 18],
        promotion: [], promotion_playoff: [], eliminated: []
    },
    // Eredivisie (18 teams): 1 CL, 2-3 CL Quali, 4 ECL Playoff, 16 Rel Playoff, 17-18 Abstieg
    'vl7oqdeheyr510j': {
        cl: [1, 2, 3], el: [], ecl: [4],
        relegation_playoff: [16], relegation: [17, 18],
        promotion: [], promotion_playoff: [], eliminated: []
    },
    // Primeira Liga (18 teams): 1-2 CL, 3 CL Quali, 4 ECL Playoff, 16 Rel Playoff, 17-18 Abstieg
    '9vjxm8ghx2r6odg': {
        cl: [1, 2, 3], el: [4], ecl: [5],
        relegation_playoff: [16], relegation: [17, 18],
        promotion: [], promotion_playoff: [], eliminated: []
    },
    // Champions League (36 teams): 1-8 Achtelfinale, 9-24 Playoffs, 25-36 Ausgeschieden
    'z8yomo4h7wq0j6l': {
        cl: [1, 2, 3, 4, 5, 6, 7, 8], // Direct to Round of 16
        el: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], // Playoffs
        ecl: [],
        relegation_playoff: [], relegation: [],
        promotion: [], promotion_playoff: [],
        eliminated: [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]
    },
    // Europa League (36 teams): 1-8 Achtelfinale, 9-24 Playoffs, 25-36 Ausgeschieden
    '56ypq3nh0xmd7oj': {
        cl: [1, 2, 3, 4, 5, 6, 7, 8], // Direct to Round of 16
        el: [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24], // Playoffs
        ecl: [],
        relegation_playoff: [], relegation: [],
        promotion: [], promotion_playoff: [],
        eliminated: [25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36]
    },
};

type ZoneType = 'cl' | 'el' | 'ecl' | 'relegation_playoff' | 'relegation' | 'promotion' | 'promotion_playoff' | 'eliminated' | null;

function getZone(position: number, leagueId: string): ZoneType {
    const zones = LEAGUE_ZONES[leagueId];
    if (!zones) return null;

    if (zones.cl.includes(position)) return 'cl';
    if (zones.el.includes(position)) return 'el';
    if (zones.ecl.includes(position)) return 'ecl';
    if (zones.relegation_playoff.includes(position)) return 'relegation_playoff';
    if (zones.relegation.includes(position)) return 'relegation';
    if (zones.promotion.includes(position)) return 'promotion';
    if (zones.promotion_playoff.includes(position)) return 'promotion_playoff';
    if (zones.eliminated.includes(position)) return 'eliminated';
    return null;
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: leagueId } = await params;
        const seasonId = CURRENT_SEASON_IDS[leagueId];

        if (!seasonId) {
            return NextResponse.json(
                { success: false, error: `No season ID configured for league ${leagueId}` },
                { status: 400 }
            );
        }

        // Fetch standings from TheSports API
        const standingsResponse = await fetch(
            `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`
        );
        const standingsData = await standingsResponse.json();

        const tables = standingsData?.results?.tables || [];
        const rows = tables[0]?.rows || [];

        if (rows.length === 0) {
            return NextResponse.json({
                success: true,
                data: { standings: [], seasonId, teamsCount: 0 },
            });
        }

        // Get all team IDs from standings
        const teamIds = rows.map((row: any) => row.team_id as string);

        // Fetch team info from Supabase in one query
        const { data: teamsData, error: teamsError } = await supabase
            .from('teams')
            .select('id, name, logo')
            .in('id', teamIds);

        if (teamsError) {
            console.error('Supabase teams fetch error:', teamsError);
        }

        // Build team lookup map directly from Supabase data
        // No manual corrections - Supabase has authoritative team names from the sync
        const teamMap = new Map<string, { name: string; logo: string }>();
        if (teamsData) {
            for (const team of teamsData) {
                teamMap.set(team.id, { name: team.name, logo: team.logo || '' });
            }
        }

        // Build standings with team info
        const standings = rows.map((row: any, idx: number) => {
            const teamInfo = teamMap.get(row.team_id) || { name: `Team ${idx + 1}`, logo: '' };
            const position = row.position || idx + 1;

            return {
                position,
                team: teamInfo.name,
                logo: teamInfo.logo,
                played: row.total || 0,
                won: row.won || 0,
                drawn: row.draw || 0,
                lost: row.loss || 0,
                goals: `${row.goals || 0}:${row.goals_against || 0}`,
                goalDiff: row.goal_diff || 0,
                points: row.points || 0,
                zone: getZone(position, leagueId),
            };
        });

        // Debug: check which teams are missing
        const missingTeams = standings.filter((s: any) => s.team.startsWith('Team '));

        return NextResponse.json({
            success: true,
            data: {
                standings,
                seasonId,
                teamsCount: standings.length,
            },
            debug: {
                teamsInDb: teamsData?.length || 0,
                missingCount: missingTeams.length,
                allTeamIds: rows.map((row: any) => ({
                    position: row.position,
                    team_id: row.team_id,
                })),
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching standings:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
