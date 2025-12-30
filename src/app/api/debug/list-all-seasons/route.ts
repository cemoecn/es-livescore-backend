/**
 * GET /api/debug/list-all-seasons
 * Lists ALL seasons for a competition to find the correct 2024/25 ID
 */

import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const competitionId = searchParams.get('competition_id') || 'gy0or5jhg6qwzv3'; // Default: Bundesliga

    try {
        const response = await fetch(
            `${API_URL}/v1/football/season/list?user=${USERNAME}&secret=${API_KEY}&competition_id=${competitionId}`
        );
        const data = await response.json();

        let seasons = data.results || data.data || [];

        // Return raw list (mapped for readability)
        return NextResponse.json({
            count: seasons.length,
            seasons: seasons.map((s: any) => ({
                id: s.id,
                year: s.year,
                name: s.name,
                has_table: s.has_table, // hypothetical field
            })),
            raw: seasons.slice(0, 3) // show first 3 raw for inspection
        });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
