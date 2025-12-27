/**
 * Debug endpoint to find top league competition IDs
 */
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Top league keywords to search for
const TOP_LEAGUES = [
    'Premier League',
    'La Liga',
    'Bundesliga',
    'Serie A',
    'Ligue 1',
    'Champions League',
    'Europa League',
    'Eredivisie',
    'Primeira Liga',
    'Championship',
];

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const page = searchParams.get('page') || '1';

    try {
        const url = `${API_URL}/v1/football/competition/additional/list?user=${USERNAME}&secret=${API_KEY}&page=${page}`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' },
            cache: 'no-store',
        });

        const data = await response.json();
        const competitions = data.results || [];

        // Filter for top leagues
        const topLeagues = competitions.filter((c: { name?: string; short_name?: string }) => {
            const name = (c.name || '').toLowerCase();
            const shortName = (c.short_name || '').toLowerCase();

            // Only match major European top leagues
            return (
                (name.includes('premier league') && (name.includes('eng ') || name.startsWith('eng'))) ||
                (name.includes('la liga') && !name.includes('women')) ||
                (name.includes('bundesliga') && name.includes('ger') && !name.includes('2')) ||
                (name.includes('serie a') && name.includes('ita') && !name.includes('women')) ||
                (name.includes('ligue 1') && name.includes('fra')) ||
                name.includes('champions league') ||
                name.includes('europa league') ||
                (name.includes('eredivisie') && !name.includes('women')) ||
                (shortName.includes('primeira') && shortName.includes('por'))
            );
        });

        return NextResponse.json({
            page,
            totalCompetitions: competitions.length,
            topLeaguesFound: topLeagues.length,
            topLeagues: topLeagues.map((c: { id: string; name: string; short_name?: string; country_id?: string }) => ({
                id: c.id,
                name: c.name,
                shortName: c.short_name,
                countryId: c.country_id,
            })),
        });
    } catch (error) {
        return NextResponse.json({
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
