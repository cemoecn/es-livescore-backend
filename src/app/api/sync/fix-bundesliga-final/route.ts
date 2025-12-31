/**
 * POST /api/sync/fix-bundesliga-final
 * Corrects all 18 Bundesliga team names in Supabase once and for all.
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const BUNDESLIGA_FIXES = [
    { id: 'yl5ergphjy2r8k0', name: 'FC Bayern Munich' },
    { id: '4zp5rzghe4nq82w', name: 'Borussia Dortmund' },
    { id: '4zp5rzghewnq82w', name: 'Bayer 04 Leverkusen' },
    { id: 'z318q66hdleqo9j', name: 'Eintracht Frankfurt' },
    { id: 'kdj2ryoh3wyq1zp', name: 'RB Leipzig' },
    { id: 'gx7lm7phd7em2wd', name: 'VfB Stuttgart' },
    { id: 'p3glrw7henvqdyj', name: 'TSG 1899 Hoffenheim' },
    { id: '9vjxm8gh613r6od', name: '1. FC Union Berlin' },
    { id: 'l965mkyh924r1ge', name: 'SC Freiburg' },
    { id: '9k82rekhdxorepz', name: 'SV Werder Bremen' },
    { id: 'yl5ergphj74r8k0', name: '1. FC Köln' },
    { id: 'l965mkyh9o4r1ge', name: 'Borussia Mönchengladbach' },
    { id: 'gy0or5jhdoyqwzv', name: 'Hamburger SV' },
    { id: '56ypq3nhdnkmd7o', name: 'VfL Wolfsburg' },
    { id: 'vl7oqdehzvnr510', name: 'FC Augsburg' },
    { id: 'gy0or5jhkvwqwzv', name: '1. FC Heidenheim' },
    { id: 'n54qllh261zqvy9', name: 'Holstein Kiel' },
    { id: 'jednm9whl2kryox', name: '1. FSV Mainz 05' },
];

export async function POST() {
    try {
        const logs: string[] = [];
        let updated = 0;

        for (const team of BUNDESLIGA_FIXES) {
            const { error } = await supabase
                .from('teams')
                .update({ name: team.name })
                .eq('id', team.id);

            if (error) {
                logs.push(`Error updating ${team.name} (${team.id}): ${error.message}`);
            } else {
                updated++;
                logs.push(`Updated ${team.name}`);
            }
        }

        return NextResponse.json({
            success: true,
            updated,
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
