/**
 * POST /api/sync/teams-by-name
 * Fetches team logos from Supabase by searching for team names
 * and updates a mapping table
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// Team names that we need logos for (from Bundesliga 2024/25)
const BUNDESLIGA_TEAMS = [
    'FC Bayern Munich',
    'Borussia Dortmund',
    'Bayer 04 Leverkusen',
    'Eintracht Frankfurt',
    'RB Leipzig',
    'VfB Stuttgart',
    'TSG 1899 Hoffenheim',
    'Union Berlin',
    'SC Freiburg',
    'SV Werder Bremen',
    'FC Köln',
    'Borussia Mönchengladbach',
    'Hamburger SV',
    'VfL Wolfsburg',
    'FC St. Pauli',
    '1. FC Heidenheim',
    'Holstein Kiel',
    '1. FSV Mainz 05',
];

export async function GET() {
    try {
        const results: any[] = [];

        for (const teamName of BUNDESLIGA_TEAMS) {
            // Search for team in Supabase by name (case insensitive)
            const { data: teams } = await supabase
                .from('teams')
                .select('id, name, logo')
                .ilike('name', `%${teamName}%`)
                .limit(5);

            const exactMatch = teams?.find(t =>
                t.name.toLowerCase() === teamName.toLowerCase() ||
                t.name.toLowerCase().includes(teamName.toLowerCase())
            );

            results.push({
                searchName: teamName,
                found: !!exactMatch,
                foundTeam: exactMatch || null,
                alternativeMatches: teams?.filter(t => t !== exactMatch)?.slice(0, 3) || [],
            });
        }

        const found = results.filter(r => r.found).length;
        const missing = results.filter(r => !r.found);

        return NextResponse.json({
            success: true,
            summary: {
                total: BUNDESLIGA_TEAMS.length,
                found,
                missing: missing.length,
            },
            results,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
