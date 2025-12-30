/**
 * GET /api/leagues/[id]/info
 * Returns combined info for a league's Info Tab:
 * - Season progress
 * - Top 3 standings (from TheSports season/recent/table/detail API)
 * - Top match of the matchday
 * - Championship history (static)
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Current 2024/25 season IDs mapped by competition_id
// These are verified to work with /v1/football/season/recent/table/detail
const CURRENT_SEASON_IDS: Record<string, string> = {
    'gy0or5jhg6qwzv3': 'e4wyrn4hgxyq86p', // Bundesliga 2024/25 - 18 teams
    'jednm9whz0ryox8': 'l965mkyhjpxr1ge', // Premier League 2024/25 - 20 teams
    'vl7oqdehlyr510j': 'l965mkyhjpxr1ge', // La Liga 2024/25 (temp - need to find correct)
    '4zp5rzghp5q82w1': 'l965mkyhjpxr1ge', // Serie A 2024/25 (temp - need to find correct)
    'yl5ergphnzr8k0o': 'e4wyrn4hgxyq86p', // Ligue 1 2024/25 (temp - need to find correct)
};

// Season info per league (2024/25)
const SEASON_INFO: Record<string, { totalMatchdays: number; season: string; teamCount: number }> = {
    'gy0or5jhg6qwzv3': { totalMatchdays: 34, season: '2024/25', teamCount: 18 }, // Bundesliga
    'jednm9whz0ryox8': { totalMatchdays: 38, season: '2024/25', teamCount: 20 }, // Premier League
    'vl7oqdehlyr510j': { totalMatchdays: 38, season: '2024/25', teamCount: 20 }, // La Liga
    '4zp5rzghp5q82w1': { totalMatchdays: 38, season: '2024/25', teamCount: 20 }, // Serie A
    'yl5ergphnzr8k0o': { totalMatchdays: 34, season: '2024/25', teamCount: 18 }, // Ligue 1
};

// Static championship data (TheSports API doesn't provide historical champions)
const CHAMPIONSHIP_DATA: Record<string, {
    lastChampion: { name: string; logo: string; season: string };
    mostTitles: { name: string; logo: string; count: number };
}> = {
    'gy0or5jhg6qwzv3': { // Bundesliga
        lastChampion: { name: 'Bayer Leverkusen', logo: 'https://img.thesports.com/football/team/a9a9d5be1fd1c5b7b0b1bc80261ac04e.png', season: '2023/24' },
        mostTitles: { name: 'Bayern München', logo: 'https://img.thesports.com/football/team/8e31e674cdfd6deb6698a6f30e605ff7.png', count: 33 },
    },
    'jednm9whz0ryox8': { // Premier League
        lastChampion: { name: 'Manchester City', logo: 'https://img.thesports.com/football/team/6a489f1676bf3e698c7c024e7bca7199.png', season: '2023/24' },
        mostTitles: { name: 'Manchester United', logo: 'https://img.thesports.com/football/team/05a7ae4ce09e34eb0ff3179efe4cf040.png', count: 20 },
    },
    'vl7oqdehlyr510j': { // La Liga
        lastChampion: { name: 'Real Madrid', logo: 'https://img.thesports.com/football/team/0c68e645b9eab2fd7a1d127a11b41c5e.png', season: '2023/24' },
        mostTitles: { name: 'Real Madrid', logo: 'https://img.thesports.com/football/team/0c68e645b9eab2fd7a1d127a11b41c5e.png', count: 36 },
    },
    '4zp5rzghp5q82w1': { // Serie A
        lastChampion: { name: 'Inter', logo: 'https://img.thesports.com/football/team/5a4cfd09ed621ceba1d4467679bb2bf6.png', season: '2023/24' },
        mostTitles: { name: 'Juventus', logo: 'https://img.thesports.com/football/team/ee4b60af8f1d30df7def1df0693a5fe9.png', count: 36 },
    },
    'yl5ergphnzr8k0o': { // Ligue 1
        lastChampion: { name: 'PSG', logo: 'https://img.thesports.com/football/team/90a7c8dbb8a3c13bb4e56ac5cfa2bfa5.png', season: '2023/24' },
        mostTitles: { name: 'PSG', logo: 'https://img.thesports.com/football/team/90a7c8dbb8a3c13bb4e56ac5cfa2bfa5.png', count: 12 },
    },
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: leagueId } = await params;
        const seasonId = CURRENT_SEASON_IDS[leagueId];
        const seasonInfo = SEASON_INFO[leagueId] || { totalMatchdays: 34, season: '2024/25', teamCount: 18 };

        // Fetch data in parallel
        const [tableResult, upcomingMatchResult, teamsResult] = await Promise.all([
            // 1. Get standings from TheSports API using season/recent/table/detail
            seasonId
                ? fetch(`${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`)
                    .then(r => r.json())
                    .catch(err => {
                        console.error('Table fetch error:', err);
                        return null;
                    })
                : Promise.resolve(null),

            // 2. Get next upcoming match for this league
            supabase
                .from('matches')
                .select('id, home_team_name, home_team_logo, away_team_name, away_team_logo, start_time, status')
                .eq('competition_id', leagueId)
                .eq('status', 'scheduled')
                .gte('start_time', new Date().toISOString())
                .order('start_time', { ascending: true })
                .limit(10),

            // 3. Get teams from Supabase cache for name lookup
            supabase
                .from('teams')
                .select('id, name, logo')
                .limit(5000),
        ]);

        // Build team lookup map
        const teamMap = new Map<string, { name: string; logo: string }>();
        if (teamsResult.data) {
            for (const team of teamsResult.data) {
                teamMap.set(team.id, { name: team.name, logo: team.logo });
            }
        }

        // Process standings from API response
        let top3Standings: Array<{
            position: number;
            team: string;
            logo: string;
            played: number;
            won: number;
            drawn: number;
            lost: number;
            goals: string;
            points: number;
            zone?: string;
        }> = [];

        let currentMatchday = 1;

        // Parse the standings from season/recent/table/detail response
        const tables = tableResult?.results?.tables || [];
        const rows = tables[0]?.rows || [];

        if (rows.length > 0) {
            // Get matchday from first team's total games played
            currentMatchday = rows[0]?.total || 1;

            // Get top 3 standings with team name lookup
            top3Standings = rows.slice(0, 3).map((row: any, idx: number) => {
                const teamInfo = teamMap.get(row.team_id) || { name: `Team ${idx + 1}`, logo: '' };
                return {
                    position: row.position || idx + 1,
                    team: teamInfo.name,
                    logo: teamInfo.logo,
                    played: row.total || 0,
                    won: row.won || 0,
                    drawn: row.draw || 0,
                    lost: row.loss || 0,
                    goals: `${row.goals || 0}:${row.goals_against || 0}`,
                    points: row.points || 0,
                    zone: idx < 4 ? 'cl' : undefined,
                };
            });
        }

        // Find top match (first upcoming match)
        let topMatch = null;
        if (upcomingMatchResult.data && upcomingMatchResult.data.length > 0) {
            const match = upcomingMatchResult.data[0];
            const matchDate = new Date(match.start_time);
            topMatch = {
                id: match.id,
                homeTeam: {
                    name: match.home_team_name || 'TBD',
                    logo: match.home_team_logo || '',
                },
                awayTeam: {
                    name: match.away_team_name || 'TBD',
                    logo: match.away_team_logo || '',
                },
                date: matchDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' }),
                time: matchDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
            };
        }

        // Get championship data
        const championships = CHAMPIONSHIP_DATA[leagueId] || null;

        return NextResponse.json({
            success: true,
            data: {
                seasonProgress: {
                    season: seasonInfo.season,
                    currentMatchday,
                    totalMatchdays: seasonInfo.totalMatchdays,
                    teamsCount: seasonInfo.teamCount,
                    progressPercent: Math.round((currentMatchday / seasonInfo.totalMatchdays) * 100),
                },
                standings: top3Standings,
                topMatch,
                championships,
            },
            debug: {
                seasonId,
                rowsFromApi: rows.length,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching league info:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
