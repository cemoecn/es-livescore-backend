/**
 * POST /api/sync/teams-fresh
 * Syncs teams using /v1/football/team/additional/list API
 * This API returns all teams with their correct IDs, names, and logos
 */

import { supabase } from '@/lib/supabase';
import { NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Fetch teams from TheSports API with pagination
async function fetchTeamsPage(page: number): Promise<any[]> {
    try {
        const url = `${API_URL}/v1/football/team/additional/list?user=${USERNAME}&secret=${API_KEY}&page=${page}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.code === 0 && data.results) {
            return data.results;
        }
        return [];
    } catch (e) {
        console.error(`Error fetching page ${page}:`, e);
        return [];
    }
}

export async function POST(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const pages = parseInt(searchParams.get('pages') || '5'); // Default 5 pages = 5000 teams

        const logs: string[] = [];
        let allTeams: { id: string; name: string; logo: string }[] = [];

        // Fetch multiple pages of teams
        logs.push(`Starting sync, fetching ${pages} pages...`);

        for (let page = 1; page <= pages; page++) {
            const teamsFromApi = await fetchTeamsPage(page);

            if (teamsFromApi.length === 0) {
                logs.push(`Page ${page}: No more teams, stopping.`);
                break;
            }

            // Map to our format
            const mappedTeams = teamsFromApi.map((t: any) => ({
                id: t.id,
                name: t.name || t.short_name || 'Unknown',
                logo: t.logo || '',
            }));

            allTeams = [...allTeams, ...mappedTeams];
            logs.push(`Page ${page}: Fetched ${teamsFromApi.length} teams (total: ${allTeams.length})`);
        }

        logs.push(`Total teams to sync: ${allTeams.length}`);

        if (allTeams.length === 0) {
            return NextResponse.json({
                success: false,
                error: 'No teams fetched from API',
                logs,
            }, { status: 400 });
        }

        // Upsert into Supabase in batches of 1000
        const batchSize = 1000;
        let inserted = 0;

        for (let i = 0; i < allTeams.length; i += batchSize) {
            const batch = allTeams.slice(i, i + batchSize);

            const { error } = await supabase
                .from('teams')
                .upsert(batch, { onConflict: 'id' });

            if (error) {
                logs.push(`Batch ${Math.floor(i / batchSize) + 1} error: ${error.message}`);
            } else {
                inserted += batch.length;
                logs.push(`Batch ${Math.floor(i / batchSize) + 1}: Upserted ${batch.length} teams`);
            }
        }

        logs.push(`Successfully synced ${inserted} teams`);

        // Show sample of synced teams
        const samples = allTeams.slice(0, 20).map(t => ({
            id: t.id,
            name: t.name,
            hasLogo: !!t.logo,
        }));

        return NextResponse.json({
            success: true,
            summary: {
                pagesProcessed: pages,
                totalFetched: allTeams.length,
                inserted,
            },
            samples,
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
