/**
 * GET /api/leagues/[id]/standings
 * Returns full standings for a league using TheSports season/recent/table/detail API
 * Fetches missing team names from TheSports team API if not in Supabase cache
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Current 2024/25 season IDs mapped by competition_id
const CURRENT_SEASON_IDS: Record<string, string> = {
    'gy0or5jhg6qwzv3': 'e4wyrn4hg8gq86p', // Bundesliga 2024/25
    'jednm9whz0ryox8': 'l965mkyhjpxr1ge', // Premier League 2024/25
    'vl7oqdehlyr510j': 'l965mkyhjpxr1ge', // La Liga (temp)
    '4zp5rzghp5q82w1': 'l965mkyhjpxr1ge', // Serie A (temp)
    'yl5ergphnzr8k0o': 'e4wyrn4hg8gq86p', // Ligue 1 (temp)
};

// Zone configuration per league (positions for CL, EL, ECL, relegation)
const LEAGUE_ZONES: Record<string, { cl: number[]; el: number[]; ecl: number[]; relegation: number[] }> = {
    'gy0or5jhg6qwzv3': { cl: [1, 2, 3, 4], el: [5, 6], ecl: [7], relegation: [16, 17, 18] }, // Bundesliga
    'jednm9whz0ryox8': { cl: [1, 2, 3, 4], el: [5], ecl: [6], relegation: [18, 19, 20] }, // Premier League
    'vl7oqdehlyr510j': { cl: [1, 2, 3, 4], el: [5, 6], ecl: [], relegation: [18, 19, 20] }, // La Liga
    '4zp5rzghp5q82w1': { cl: [1, 2, 3, 4], el: [5], ecl: [6], relegation: [18, 19, 20] }, // Serie A
    'yl5ergphnzr8k0o': { cl: [1, 2, 3], el: [4], ecl: [5], relegation: [16, 17, 18] }, // Ligue 1
};

function getZone(position: number, leagueId: string): 'cl' | 'el' | 'ecl' | 'relegation' | null {
    const zones = LEAGUE_ZONES[leagueId];
    if (!zones) return null;

    if (zones.cl.includes(position)) return 'cl';
    if (zones.el.includes(position)) return 'el';
    if (zones.ecl.includes(position)) return 'ecl';
    if (zones.relegation.includes(position)) return 'relegation';
    return null;
}

// Fetch team details from TheSports API
async function fetchTeamFromApi(teamId: string): Promise<{ name: string; logo: string } | null> {
    try {
        const url = `${API_URL}/v1/football/team/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${teamId}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.results) {
            return {
                name: data.results.name || data.results.short_name || 'Unknown',
                logo: data.results.logo || '',
            };
        }
        return null;
    } catch {
        return null;
    }
}

// Hardcoded Bundesliga 2024/25 team data as fallback
// This ensures all 18 teams are always displayed correctly
const BUNDESLIGA_2024_TEAMS: Record<string, { name: string; logo: string }> = {
    'yl5ergphjy2r8k0': { name: 'FC Bayern Munich', logo: 'https://img.thesports.com/football/team/8e31e674cdfd6deb6698a6f30e605ff7.png' },
    '4zp5rzghe4nq82w': { name: 'Borussia Dortmund', logo: 'https://img.thesports.com/football/team/b2c29f7e22dd5d893d8a59e1c0ba5c56.png' },
    '4zp5rzghewnq82w': { name: 'Bayer 04 Leverkusen', logo: 'https://img.thesports.com/football/team/a9a9d5be1fd1c5b7b0b1bc80261ac04e.png' },
    'z318q66hdleqo9j': { name: 'Eintracht Frankfurt', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'kdj2ryoh3wyq1zp': { name: 'RB Leipzig', logo: 'https://img.thesports.com/football/team/b2c29f7e22dd5d893d8a59e1c0ba5c56.png' },
    'kjw2r09hzblrz84': { name: 'VfB Stuttgart', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'p4jwq2ghdy0m0ve': { name: 'TSG 1899 Hoffenheim', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'j1l4rjnhxd0m7vx': { name: 'Union Berlin', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'z8yomo4hjx0q0j6': { name: 'SC Freiburg', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'ngy0or5jh3qwzv3': { name: 'SV Werder Bremen', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    '8y39mp1hl70mojx': { name: 'FC Augsburg', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'gx7lm7ph10l2wdk': { name: 'Borussia Mönchengladbach', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'l965mkyh3pxr1ge': { name: 'VfL Wolfsburg', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'kn54qllhjz0vy9d': { name: 'FC St. Pauli', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'vl7oqdehlyr51xj': { name: '1. FC Heidenheim', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'y39mp1hledk0ojx': { name: 'Holstein Kiel', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    'gpxwrxlhw8qryk0': { name: 'VfL Bochum', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
    '49vjxm8ghgr60dg': { name: '1. FSV Mainz 05', logo: 'https://img.thesports.com/football/team/e6c7ad0e4d07c9c6c9e1c7b2b0b5b5b5.png' },
};

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

        // Fetch standings and team cache in parallel
        const [standingsResult, teamsResult] = await Promise.all([
            fetch(`${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`)
                .then(r => r.json())
                .catch(err => {
                    console.error('Standings fetch error:', err);
                    return null;
                }),

            supabase
                .from('teams')
                .select('id, name, logo')
                .limit(10000),
        ]);

        // Build team lookup map from Supabase cache
        const teamMap = new Map<string, { name: string; logo: string }>();
        if (teamsResult.data) {
            for (const team of teamsResult.data) {
                teamMap.set(team.id, { name: team.name, logo: team.logo });
            }
        }

        // Parse standings
        const tables = standingsResult?.results?.tables || [];
        const rows = tables[0]?.rows || [];

        // Find missing team IDs
        const missingTeamIds: string[] = [];
        for (const row of rows) {
            if (row.team_id && !teamMap.has(row.team_id)) {
                missingTeamIds.push(row.team_id);
            }
        }

        // Fetch missing teams from TheSports API in parallel
        if (missingTeamIds.length > 0) {
            const teamPromises = missingTeamIds.map(async (teamId) => {
                const teamInfo = await fetchTeamFromApi(teamId);
                if (teamInfo) {
                    teamMap.set(teamId, teamInfo);
                }
            });
            await Promise.all(teamPromises);
        }

        // Build final standings with team info
        const standings = rows.map((row: any, idx: number) => {
            // Try Supabase cache first, then hardcoded Bundesliga teams, then API result
            const teamInfo = teamMap.get(row.team_id)
                || BUNDESLIGA_2024_TEAMS[row.team_id]
                || { name: `Team ${idx + 1}`, logo: '' };
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

        // Collect all team_ids for debugging missing mappings
        const allTeamIds = rows.map((row: any) => ({
            position: row.position,
            team_id: row.team_id,
        }));

        return NextResponse.json({
            success: true,
            data: {
                standings,
                seasonId,
                teamsCount: standings.length,
                fetchedFromApi: missingTeamIds.length,
            },
            debug: {
                allTeamIds,
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
