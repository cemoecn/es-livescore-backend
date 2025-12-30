/**
 * GET /api/debug/current-season
 * Fetches current season table for a competition directly from TheSports API
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const competitionId = searchParams.get('competition_id') || 'gy0or5jhg6qwzv3'; // Default: Bundesliga

    try {
        // Step 1: Get all seasons for this competition
        const seasonsResponse = await fetch(
            `${API_URL}/v1/football/season/list?user=${USERNAME}&secret=${API_KEY}&competition_id=${competitionId}`
        );
        const seasonsData = await seasonsResponse.json();

        // Find current/latest season
        const seasons = seasonsData.results || seasonsData.data || [];

        // Sort by year descending
        const sortedSeasons = [...seasons].sort((a: any, b: any) => {
            const yearA = parseInt(a.year || '0');
            const yearB = parseInt(b.year || '0');
            return yearB - yearA;
        });

        const currentSeason = sortedSeasons[0];

        if (!currentSeason?.id) {
            return NextResponse.json({
                success: false,
                error: 'No current season found',
                allSeasons: seasons.slice(0, 5),
            });
        }

        // Step 2: Get table for this season
        const tableResponse = await fetch(
            `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${currentSeason.id}`
        );
        const tableData = await tableResponse.json();

        // Get team names from Supabase
        const { data: teams } = await supabase.from('teams').select('id, name, logo');
        const teamMap = new Map(teams?.map(t => [t.id, { name: t.name, logo: t.logo }]) || []);

        // Process standings
        const results = tableData.results;
        const rows = results?.tables?.[0]?.rows || [];

        const standings = rows.slice(0, 10).map((row: any, idx: number) => {
            const teamInfo = teamMap.get(row.team_id);
            return {
                position: row.position || idx + 1,
                team_id: row.team_id,
                team_name: teamInfo?.name || 'Unknown',
                played: row.total || 0,
                won: row.won || 0,
                draw: row.draw || 0,
                lost: row.loss || 0,
                goals_for: row.goals || 0,
                goals_against: row.goals_against || 0,
                points: row.points || 0,
            };
        });

        return NextResponse.json({
            success: true,
            competition_id: competitionId,
            current_season: {
                id: currentSeason.id,
                name: currentSeason.name,
                year: currentSeason.year,
            },
            all_seasons_count: seasons.length,
            matchday: rows[0]?.total || 0,
            standings,
        });
    } catch (error) {
        return NextResponse.json({
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
    }
}

export const dynamic = 'force-dynamic';
