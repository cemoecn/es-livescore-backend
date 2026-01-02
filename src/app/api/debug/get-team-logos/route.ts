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
const TEAM_NAMES = [
    'Leicester', // Try broader for Leicester
    'AFC Ajax', // Try specific for Ajax
    'Feyenoord', // Alternative for Eredivisie
    'FC Porto', // Alternative for Primeira
];

export async function GET() {
    try {
        const results: any[] = [];

        for (const name of TEAM_NAMES) {
            // Search Supabase by name
            const { data: teams } = await supabase
                .from('teams')
                .select('id, name, logo')
                .ilike('name', `%${name}%`)
                .limit(1);

            if (teams && teams.length > 0) {
                const team = teams[0];
                results.push({
                    id: team.id,
                    name: team.name, // Use database name
                    reqName: name,
                    logo: team.logo,
                    source: 'supabase',
                });
            } else {
                results.push({
                    name: name,
                    found: false
                });
            }
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
