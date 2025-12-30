/**
 * GET /api/debug/check-teams
 * Checks if specific team IDs from standings API exist in Supabase teams table
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const TEAM_IDS_TO_CHECK = [
    'z318q66hdd1qo9j', // Liverpool (from PL standings)
    'p4jwq2ghd57m0ve', // Chelsea (from PL standings)
    'j1l4rjnh06om7vx', // Arsenal (from PL standings)
    '318q66hoklkqo9j', // Bayern (from Bundesliga standings)
];

export async function GET() {
    try {
        // Check these specific team IDs in Supabase
        const { data: teams, error } = await supabase
            .from('teams')
            .select('id, name, logo')
            .in('id', TEAM_IDS_TO_CHECK);

        // Also get total count of teams in cache
        const { count } = await supabase
            .from('teams')
            .select('*', { count: 'exact', head: true });

        // Get a sample of teams to see ID format
        const { data: sampleTeams } = await supabase
            .from('teams')
            .select('id, name')
            .limit(5);

        return NextResponse.json({
            success: true,
            searchedIds: TEAM_IDS_TO_CHECK,
            foundTeams: teams || [],
            totalTeamsInCache: count,
            sampleTeamIds: sampleTeams?.map(t => ({ id: t.id, name: t.name })) || [],
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
