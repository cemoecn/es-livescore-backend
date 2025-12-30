/**
 * GET /api/leagues/[id]/info
 * Returns combined info for a league's Info Tab:
 * - Season progress
 * - Top 3 standings (from TheSports table/live API)
 * - Top match of the matchday
 * - Championship history (static)
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

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

// Season info per league (2024/25)
const SEASON_INFO: Record<string, { totalMatchdays: number; season: string }> = {
    'gy0or5jhg6qwzv3': { totalMatchdays: 34, season: '2024/25' }, // Bundesliga
    'jednm9whz0ryox8': { totalMatchdays: 38, season: '2024/25' }, // Premier League
    'vl7oqdehlyr510j': { totalMatchdays: 38, season: '2024/25' }, // La Liga
    '4zp5rzghp5q82w1': { totalMatchdays: 38, season: '2024/25' }, // Serie A
    'yl5ergphnzr8k0o': { totalMatchdays: 34, season: '2024/25' }, // Ligue 1
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: leagueId } = await params;

        // Fetch data in parallel
        const [tableResult, upcomingMatchResult, teamsResult, leagueTeamsResult] = await Promise.all([
            // 1. Get all live tables from TheSports API
            fetch(`${API_URL}/v1/football/table/live?user=${USERNAME}&secret=${API_KEY}`)
                .then(r => r.json())
                .catch(err => {
                    console.error('Table fetch error:', err);
                    return null;
                }),

            // 2. Get next upcoming match for this league
            supabase
                .from('matches')
                .select('id, home_team_name, home_team_logo, away_team_name, away_team_logo, start_time, status')
                .eq('competition_id', leagueId)
                .eq('status', 'scheduled')
                .gte('start_time', new Date().toISOString())
                .order('start_time', { ascending: true })
                .limit(10),

            // 3. Get teams from cache for name lookup
            supabase
                .from('teams')
                .select('id, name, logo')
                .limit(5000),

            // 4. Get unique team IDs from matches for this league (to identify correct table)
            supabase
                .from('matches')
                .select('home_team_id, away_team_id')
                .eq('competition_id', leagueId)
                .limit(100),
        ]);

        // Build team lookup map
        const teamMap = new Map<string, { name: string; logo: string }>();
        if (teamsResult.data) {
            for (const team of teamsResult.data) {
                teamMap.set(team.id, { name: team.name, logo: team.logo });
            }
        }

        // Extract unique team IDs for this league from matches
        const leagueTeamIds = new Set<string>();
        if (leagueTeamsResult.data) {
            for (const match of leagueTeamsResult.data) {
                if (match.home_team_id) leagueTeamIds.add(match.home_team_id);
                if (match.away_team_id) leagueTeamIds.add(match.away_team_id);
            }
        }

        // Process standings - find the table that matches our league's teams
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
        const seasonInfo = SEASON_INFO[leagueId] || { totalMatchdays: 34, season: '2024/25' };

        // Find the matching table from table/live response
        let tablesChecked = 0;
        let dataArrayIsArray = false;
        let dataArrayLength = 0;

        // Check if data is in the expected format
        const tableDataArray = tableResult?.data || tableResult?.results || [];
        dataArrayIsArray = Array.isArray(tableDataArray);
        dataArrayLength = dataArrayIsArray ? tableDataArray.length : 0;

        if (dataArrayIsArray && dataArrayLength > 0 && leagueTeamIds.size > 0) {
            // Iterate through all tables and find the one with highest team overlap
            let bestMatch: { rows: any[]; matchCount: number } | null = null;

            for (const tableEntry of tableDataArray) {
                tablesChecked++;
                if (!tableEntry.tables?.[0]?.rows) continue;

                const rows = tableEntry.tables[0].rows;
                const tableTeamIds = new Set(rows.map((r: any) => r.team_id));

                // Count how many of our league's teams are in this table
                let matchCount = 0;
                for (const teamId of leagueTeamIds) {
                    if (tableTeamIds.has(teamId)) matchCount++;
                }

                // If we have significant overlap (at least 5 matching teams), this is likely our table
                if (matchCount >= 5 && (!bestMatch || matchCount > bestMatch.matchCount)) {
                    bestMatch = { rows, matchCount };
                }
            }

            if (bestMatch) {
                const rows = bestMatch.rows;

                // Calculate current matchday from first team's total games
                if (rows.length > 0) {
                    currentMatchday = Math.max(rows[0].total || 1, 1);
                }

                // Get top 3 standings
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
        }

        // Fallback: If no table found in table/live, calculate from Supabase matches
        if (top3Standings.length === 0) {
            // Get finished matches for this league
            const { data: finishedMatches } = await supabase
                .from('matches')
                .select('home_team_id, home_team_name, home_team_logo, away_team_id, away_team_name, away_team_logo, home_score, away_score')
                .eq('competition_id', leagueId)
                .eq('status', 'finished');

            if (finishedMatches && finishedMatches.length > 0) {
                // Calculate standings from matches
                type TeamStats = {
                    id: string;
                    name: string;
                    logo: string;
                    played: number;
                    won: number;
                    drawn: number;
                    lost: number;
                    goalsFor: number;
                    goalsAgainst: number;
                    points: number;
                };
                const teamStatsMap = new Map<string, TeamStats>();

                for (const match of finishedMatches) {
                    const homeId = match.home_team_id;
                    const awayId = match.away_team_id;
                    const homeScore = match.home_score ?? 0;
                    const awayScore = match.away_score ?? 0;

                    if (!teamStatsMap.has(homeId)) {
                        teamStatsMap.set(homeId, {
                            id: homeId,
                            name: match.home_team_name || teamMap.get(homeId)?.name || 'Unknown',
                            logo: match.home_team_logo || teamMap.get(homeId)?.logo || '',
                            played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
                        });
                    }
                    if (!teamStatsMap.has(awayId)) {
                        teamStatsMap.set(awayId, {
                            id: awayId,
                            name: match.away_team_name || teamMap.get(awayId)?.name || 'Unknown',
                            logo: match.away_team_logo || teamMap.get(awayId)?.logo || '',
                            played: 0, won: 0, drawn: 0, lost: 0, goalsFor: 0, goalsAgainst: 0, points: 0,
                        });
                    }

                    const homeStats = teamStatsMap.get(homeId)!;
                    const awayStats = teamStatsMap.get(awayId)!;

                    homeStats.played++; awayStats.played++;
                    homeStats.goalsFor += homeScore; homeStats.goalsAgainst += awayScore;
                    awayStats.goalsFor += awayScore; awayStats.goalsAgainst += homeScore;

                    if (homeScore > awayScore) {
                        homeStats.won++; homeStats.points += 3; awayStats.lost++;
                    } else if (homeScore < awayScore) {
                        awayStats.won++; awayStats.points += 3; homeStats.lost++;
                    } else {
                        homeStats.drawn++; awayStats.drawn++; homeStats.points++; awayStats.points++;
                    }
                }

                // Sort and get top 3
                const sortedStandings = Array.from(teamStatsMap.values())
                    .sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst));

                if (sortedStandings.length > 0) {
                    currentMatchday = Math.ceil(finishedMatches.length / (sortedStandings.length / 2)) || 1;
                }

                top3Standings = sortedStandings.slice(0, 3).map((s, idx) => ({
                    position: idx + 1,
                    team: s.name,
                    logo: s.logo,
                    played: s.played,
                    won: s.won,
                    drawn: s.drawn,
                    lost: s.lost,
                    goals: `${s.goalsFor}:${s.goalsAgainst}`,
                    points: s.points,
                    zone: idx < 4 ? 'cl' : undefined,
                }));
            }
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
                    teamsCount: leagueTeamIds.size || 18,
                    progressPercent: Math.round((currentMatchday / seasonInfo.totalMatchdays) * 100),
                },
                standings: top3Standings,
                topMatch,
                championships,
            },
            debug: {
                leagueTeamCount: leagueTeamIds.size,
                tablesChecked,
                dataArrayIsArray,
                dataArrayLength,
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
