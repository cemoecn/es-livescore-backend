/**
 * POST /api/sync/fix-bundesliga-teams
 * Fixes incorrect team names in Supabase for Bundesliga teams
 * Uses the correct team_id to name mapping from TheSports standings
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

// Correct Bundesliga 2024/25 team mappings (from standings debug data)
const BUNDESLIGA_CORRECT_TEAMS: { id: string; name: string; position: number }[] = [
    { id: 'yl5ergphjy2r8k0', name: 'FC Bayern Munich', position: 1 },
    { id: '4zp5rzghe4nq82w', name: 'Borussia Dortmund', position: 2 },
    { id: '4zp5rzghewnq82w', name: 'Bayer 04 Leverkusen', position: 3 },
    { id: 'z318q66hdleqo9j', name: 'Eintracht Frankfurt', position: 4 },
    { id: 'kdj2ryoh3wyq1zp', name: 'RB Leipzig', position: 5 },
    { id: 'gx7lm7phd7em2wd', name: 'VfB Stuttgart', position: 6 },
    { id: 'p3glrw7henvqdyj', name: 'TSG 1899 Hoffenheim', position: 7 },  // WAS WRONG
    { id: '9vjxm8gh613r6od', name: 'Union Berlin', position: 8 },
    { id: 'l965mkyh924r1ge', name: 'SC Freiburg', position: 9 },
    { id: '9k82rekhdxorepz', name: 'SV Werder Bremen', position: 10 },
    { id: 'yl5ergphj74r8k0', name: '1. FC Köln', position: 11 },
    { id: 'l965mkyh9o4r1ge', name: 'Borussia Mönchengladbach', position: 12 },
    { id: 'gy0or5jhdoyqwzv', name: 'Hamburger SV', position: 13 },
    { id: '56ypq3nhdnkmd7o', name: 'VfL Wolfsburg', position: 14 },
    { id: 'vl7oqdehzvnr510', name: 'FC St. Pauli', position: 15 },
    { id: 'gy0or5jhkvwqwzv', name: '1. FC Heidenheim', position: 16 },
    { id: 'n54qllh261zqvy9', name: 'Holstein Kiel', position: 17 },
    { id: 'jednm9whl2kryox', name: '1. FSV Mainz 05', position: 18 },
];

export async function POST() {
    try {
        const logs: string[] = [];
        let fixed = 0;

        for (const team of BUNDESLIGA_CORRECT_TEAMS) {
            // Check current value in Supabase
            const { data: current } = await supabase
                .from('teams')
                .select('name')
                .eq('id', team.id)
                .single();

            if (current && current.name !== team.name) {
                logs.push(`Fixing ${team.id}: "${current.name}" → "${team.name}"`);

                // Update to correct name
                const { error } = await supabase
                    .from('teams')
                    .update({ name: team.name })
                    .eq('id', team.id);

                if (error) {
                    logs.push(`  Error: ${error.message}`);
                } else {
                    fixed++;
                }
            } else if (!current) {
                logs.push(`Team ${team.id} not found in Supabase`);
            }
        }

        logs.push(`Fixed ${fixed} team names`);

        return NextResponse.json({
            success: true,
            fixed,
            logs,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
