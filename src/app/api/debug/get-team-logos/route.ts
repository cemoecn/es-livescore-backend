/**
 * GET /api/debug/get-team-logos
 * Fetches logos for specific team IDs from both Supabase and TheSports API
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Teams that need logos
const TEAMS_NEEDING_LOGOS = [
    { id: 'z318q66hdleqo9j', name: 'Eintracht Frankfurt' },
    { id: 'gx7lm7phd7em2wd', name: 'VfB Stuttgart' },
    { id: 'p3glrw7henvqdyj', name: 'TSG 1899 Hoffenheim' },
    { id: '9vjxm8gh613r6od', name: 'Union Berlin' },
    { id: 'vl7oqdehzvnr510', name: 'FC St. Pauli' },
    { id: 'gy0or5jhkvwqwzv', name: '1. FC Heidenheim' },
    { id: 'n54qllh261zqvy9', name: 'Holstein Kiel' },
];

export async function GET() {
    try {
        const results: any[] = [];

        // Try Supabase first
        const { data: supabaseTeams } = await supabase
            .from('teams')
            .select('id, name, logo')
            .in('id', TEAMS_NEEDING_LOGOS.map(t => t.id));

        for (const team of TEAMS_NEEDING_LOGOS) {
            let logo = '';
            let source = '';

            // Check Supabase
            const supaTeam = supabaseTeams?.find(t => t.id === team.id);
            if (supaTeam?.logo) {
                logo = supaTeam.logo;
                source = 'supabase';
            } else {
                // Try TheSports API
                try {
                    const url = `${API_URL}/v1/football/team/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${team.id}`;
                    const response = await fetch(url);
                    const data = await response.json();
                    if (data.results?.logo) {
                        logo = data.results.logo;
                        source = 'api';
                    }
                } catch (e) {
                    // ignore
                }
            }

            results.push({
                id: team.id,
                name: team.name,
                logo,
                source,
            });
        }

        // Generate code for easy copy-paste
        const codeLines = results
            .filter(r => r.logo)
            .map(r => `    '${r.id}': { name: '${r.name}', logo: '${r.logo}' },`);

        return NextResponse.json({
            success: true,
            results,
            code: codeLines.join('\n'),
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
