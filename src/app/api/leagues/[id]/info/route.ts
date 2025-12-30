/**
 * GET /api/leagues/[id]/info
 * Returns combined info for a league's Info Tab:
 * - Season progress
 * - Top 3 standings
 * - Top match of the matchday
 * - Championship history (static)
 */

import { supabase } from '@/lib/supabase';
import { getStandings } from '@/services/thesports';
import { NextRequest, NextResponse } from 'next/server';

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
    'vl7oqdeheyr510j': { // Eredivisie
        lastChampion: { name: 'PSV', logo: 'https://img.thesports.com/football/team/4f7f16d3ec72891bf3afd2ff2bbf4a7a.png', season: '2023/24' },
        mostTitles: { name: 'Ajax', logo: 'https://img.thesports.com/football/team/5c8a4c6e2cf8be6c15be17e6a7c69b3a.png', count: 36 },
    },
    '9vjxm8ghx2r6odg': { // Primeira Liga
        lastChampion: { name: 'Sporting CP', logo: 'https://img.thesports.com/football/team/d9f57d62f96988c1e4f50e6aad18cbcb.png', season: '2023/24' },
        mostTitles: { name: 'Benfica', logo: 'https://img.thesports.com/football/team/c00df08e20e9e36c10f5b54d0d72a66f.png', count: 38 },
    },
    'l965mkyh32r1ge4': { // Championship
        lastChampion: { name: 'Leicester City', logo: 'https://img.thesports.com/football/team/87e4df7e7e97a4e8a6e5aae7e5e5be66.png', season: '2023/24' },
        mostTitles: { name: 'Leicester City', logo: 'https://img.thesports.com/football/team/87e4df7e7e97a4e8a6e5aae7e5e5be66.png', count: 7 },
    },
};

// Season info per league (2024/25)
const SEASON_INFO: Record<string, { totalMatchdays: number; season: string }> = {
    'gy0or5jhg6qwzv3': { totalMatchdays: 34, season: '2024/25' }, // Bundesliga
    'jednm9whz0ryox8': { totalMatchdays: 38, season: '2024/25' }, // Premier League
    'vl7oqdehlyr510j': { totalMatchdays: 38, season: '2024/25' }, // La Liga
    '4zp5rzghp5q82w1': { totalMatchdays: 38, season: '2024/25' }, // Serie A
    'yl5ergphnzr8k0o': { totalMatchdays: 34, season: '2024/25' }, // Ligue 1
    'vl7oqdeheyr510j': { totalMatchdays: 34, season: '2024/25' }, // Eredivisie
    '9vjxm8ghx2r6odg': { totalMatchdays: 34, season: '2024/25' }, // Primeira Liga
    'l965mkyh32r1ge4': { totalMatchdays: 46, season: '2024/25' }, // Championship
};

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: leagueId } = await params;

        // Fetch data in parallel
        const [standingsResult, upcomingMatchResult, finishedMatchesResult] = await Promise.all([
            // 1. Get standings from TheSports API
            getStandings({ competition_id: leagueId }).catch(err => {
                console.error('Standings fetch error:', err);
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

            // 3. Count finished matches to calculate current matchday
            supabase
                .from('matches')
                .select('id', { count: 'exact', head: true })
                .eq('competition_id', leagueId)
                .eq('status', 'finished'),
        ]);

        // Process standings - get top 3
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

        if (standingsResult?.standings) {
            // Cast to any to handle TheSports API response structure differences
            top3Standings = (standingsResult.standings as any[]).slice(0, 3).map((s, idx) => ({
                position: idx + 1,
                team: s.team_name || s.team?.name || `Team ${idx + 1}`,
                logo: s.team_logo || s.team?.logo || '',
                played: s.total?.match || s.played || 0,
                won: s.total?.win || s.won || 0,
                drawn: s.total?.draw || s.drawn || 0,
                lost: s.total?.loss || s.lost || 0,
                goals: `${s.total?.goals || s.goals_for || 0}:${s.total?.goals_against || s.goals_against || 0}`,
                points: s.total?.points || s.points || 0,
                zone: idx < 4 ? 'cl' : undefined, // Top 4 = Champions League zone
            }));
        }

        // Find top match (highest-ranked teams playing each other)
        let topMatch = null;
        if (upcomingMatchResult.data && upcomingMatchResult.data.length > 0) {
            // For now, just take the first upcoming match
            // In a more sophisticated version, we'd rank by team positions
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

        // Calculate season progress
        const seasonInfo = SEASON_INFO[leagueId] || { totalMatchdays: 34, season: '2024/25' };
        const teamsCount = standingsResult?.standings?.length || 18;
        const matchesPerMatchday = teamsCount / 2;
        const finishedMatches = finishedMatchesResult.count || 0;
        const currentMatchday = Math.min(
            Math.ceil(finishedMatches / matchesPerMatchday) + 1,
            seasonInfo.totalMatchdays
        );

        // Get championship data
        const championships = CHAMPIONSHIP_DATA[leagueId] || null;

        return NextResponse.json({
            success: true,
            data: {
                seasonProgress: {
                    season: seasonInfo.season,
                    currentMatchday,
                    totalMatchdays: seasonInfo.totalMatchdays,
                    teamsCount,
                    progressPercent: Math.round((currentMatchday / seasonInfo.totalMatchdays) * 100),
                },
                standings: top3Standings,
                topMatch,
                championships,
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
