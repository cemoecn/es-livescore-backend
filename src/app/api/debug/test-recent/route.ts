/**
 * Debug endpoint to test match/recent/list with date filtering
 */
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString().split('T')[0];
    const page = searchParams.get('page') || '1';
    const search = searchParams.get('search') || '';

    try {
        // Test /match/recent/list endpoint
        const url = `${API_URL}/v1/football/match/recent/list?user=${USERNAME}&secret=${API_KEY}&page=${page}`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });

        const data = await response.json();

        if (data.err) {
            return NextResponse.json({
                error: data.err,
                code: data.code,
            });
        }

        const matches = data.results || data.data || [];

        // Filter by date if provided
        const dateStart = new Date(`${date}T00:00:00Z`).getTime() / 1000;
        const dateEnd = new Date(`${date}T23:59:59Z`).getTime() / 1000;

        const filteredMatches = matches.filter((m: { match_time?: number }) => {
            if (!m.match_time) return false;
            return m.match_time >= dateStart && m.match_time <= dateEnd;
        });

        // Search if provided
        let searchResults = filteredMatches;
        if (search) {
            // Get team names for search
            const teamUrl = `${API_URL}/v1/football/team/additional/list?user=${USERNAME}&secret=${API_KEY}&page=1`;
            const teamResp = await fetch(teamUrl, { headers: { 'Accept': 'application/json' } });
            const teamData = await teamResp.json();
            const teams = teamData.results || [];

            const teamMap: Record<string, string> = {};
            teams.forEach((t: { id: string; name: string }) => {
                teamMap[t.id] = t.name;
            });

            searchResults = filteredMatches.filter((m: { home_team_id?: string; away_team_id?: string }) => {
                const homeName = teamMap[m.home_team_id || ''] || '';
                const awayName = teamMap[m.away_team_id || ''] || '';
                return homeName.toLowerCase().includes(search.toLowerCase()) ||
                    awayName.toLowerCase().includes(search.toLowerCase());
            });
        }

        return NextResponse.json({
            endpoint: '/v1/football/match/recent/list',
            page,
            date,
            totalInPage: matches.length,
            matchesOnDate: filteredMatches.length,
            searchResults: searchResults.length,
            samples: searchResults.slice(0, 10).map((m: {
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
                competition_id: m.competition_id,
                status_id: m.status_id,
                match_time: m.match_time,
                date: m.match_time ? new Date(m.match_time * 1000).toISOString() : null,
            })),
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
