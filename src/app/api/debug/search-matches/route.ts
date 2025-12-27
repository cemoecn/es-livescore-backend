/**
 * Debug endpoint to search for specific matches in TheSports API
 */
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0].replace(/-/g, '');
    const search = searchParams.get('search') || '';

    try {
        // Fetch diary matches
        const url = `${API_URL}/v1/football/match/diary?user=${USERNAME}&secret=${API_KEY}&date=${date}`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });

        const data = await response.json();
        const matches = data.results || data.data || [];

        // Collect unique team and competition IDs
        const teamIds = new Set<string>();
        const compIds = new Set<string>();

        matches.forEach((m: { home_team_id?: string; away_team_id?: string; competition_id?: string }) => {
            if (m.home_team_id) teamIds.add(m.home_team_id);
            if (m.away_team_id) teamIds.add(m.away_team_id);
            if (m.competition_id) compIds.add(m.competition_id);
        });

        // Fetch team names for first few to check
        const teamSamples: Record<string, string> = {};
        const compSamples: Record<string, string> = {};

        // Get first 10 team names
        const teamIdArray = Array.from(teamIds).slice(0, 50);
        if (teamIdArray.length > 0) {
            const teamUrl = `${API_URL}/v1/football/team/additional/list?user=${USERNAME}&secret=${API_KEY}&page=1`;
            const teamResp = await fetch(teamUrl, { headers: { 'Accept': 'application/json' } });
            const teamData = await teamResp.json();
            const teams = teamData.results || [];

            teams.forEach((t: { id: string; name: string }) => {
                if (teamIdArray.includes(t.id)) {
                    teamSamples[t.id] = t.name;
                }
            });
        }

        // Filter if search provided
        let filteredMatches = matches;
        if (search) {
            // We need to check team names - for now just return raw matches
            filteredMatches = matches.filter((m: { id?: string }) =>
                JSON.stringify(m).toLowerCase().includes(search.toLowerCase())
            );
        }

        return NextResponse.json({
            date,
            totalMatches: matches.length,
            uniqueTeams: teamIds.size,
            uniqueCompetitions: compIds.size,
            searchQuery: search || null,
            filteredCount: filteredMatches.length,
            samples: filteredMatches.slice(0, 10).map((m: {
                id: string;
                home_team_id?: string;
                away_team_id?: string;
                competition_id?: string;
                status_id?: number;
                match_time?: number;
            }) => ({
                id: m.id,
                home_team_id: m.home_team_id,
                away_team_id: m.away_team_id,
                home_team_name: teamSamples[m.home_team_id || ''] || 'unknown',
                away_team_name: teamSamples[m.away_team_id || ''] || 'unknown',
                competition_id: m.competition_id,
                status_id: m.status_id,
                match_time: m.match_time,
            })),
            teamSamplesFound: Object.keys(teamSamples).length,
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
