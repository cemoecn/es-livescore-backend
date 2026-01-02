/**
 * GET /api/leagues/[id]/standings
 * Returns full standings for a league using TheSports season/recent/table/detail API
 * Team names and logos are fetched from Supabase teams cache (synced from TheSports)
 * Zone/Promotion data is now fetched dynamically from the API
 */

import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.THESPORTS_API_URL || 'https://api.thesports.com';
const API_KEY = process.env.THESPORTS_API_KEY || '';
const USERNAME = process.env.THESPORTS_USERNAME || '';

// Current 2025/26 season IDs mapped by competition_id
const CURRENT_SEASON_IDS: Record<string, string> = {
    'gy0or5jhg6qwzv3': 'e4wyrn4hg8gq86p', // Bundesliga 2025/26
    'jednm9whz0ryox8': 'l965mkyhjpxr1ge', // Premier League 2025/26
    'l965mkyh32r1ge4': '56ypq3nhx51md7o', // Championship 2025/26
    'vl7oqdehlyr510j': '56ypq3nhxw7md7o', // La Liga 2025/26
    '4zp5rzghp5q82w1': '4zp5rzghn83q82w', // Serie A 2025/26
    'yl5ergphnzr8k0o': '9dn1m1gh645moep', // Ligue 1 2025/26
    'vl7oqdeheyr510j': 'yl5ergphgo0r8k0', // Eredivisie 2025/26
    '9vjxm8ghx2r6odg': 'kjw2r09h811rz84', // Primeira Liga 2025/26
    'z8yomo4h7wq0j6l': 'z8yomo4hn70q0j6', // Champions League 2025/26
    '56ypq3nh0xmd7oj': 'v2y8m4zhl38ql07', // Europa League 2025/26
};

// German translations for promotion names from API
const PROMOTION_LABELS: Record<string, string> = {
    // Champions League
    'Champions League league stage': 'UEFA Champions League',
    'Champions League': 'UEFA Champions League',
    'CL Group': 'UEFA Champions League',
    'CL league stage': 'UEFA Champions League',
    // Europa League
    'Europa League league stage': 'UEFA Europa League',
    'Europa League': 'UEFA Europa League',
    'EL Group': 'UEFA Europa League',
    'EL league stage': 'UEFA Europa League',
    // Conference League (many variants)
    'UEFA ECL Qualification': 'UEFA Conference League',
    'UEFA ECL Playoffs': 'UEFA Conference League',
    'UEFA ECL qualifying playoffs': 'UEFA Conference League',
    'Conference League': 'UEFA Conference League',
    'ECL Qualification': 'UEFA Conference League',
    'ECL qualifying playoffs': 'UEFA Conference League',
    'ECL Playoffs': 'UEFA Conference League',
    // Relegation
    'Relegation Playoffs': 'Relegation',
    'Relegation playoffs': 'Relegation',
    'Relegation Playoff': 'Relegation',
    // Abstieg
    'Degrade Team': 'Abstieg',
    'Relegation': 'Abstieg',
    'Relegated': 'Abstieg',
    // Aufstieg
    'Promoted': 'Direkter Aufstieg',
    'Promotion': 'Direkter Aufstieg',
    'Direct Promotion': 'Direkter Aufstieg',
    // Playoffs
    'Promotion Playoffs': 'Aufstiegs-Playoffs',
    'Promotion playoffs': 'Aufstiegs-Playoffs',
    'Promotion Playoff': 'Aufstiegs-Playoffs',
    // UEFA Wettbewerbe Runden
    'Round of 16': 'Achtelfinale',
    'Knockout stage playoffs': 'Playoffs',
    'Eliminated': 'Ausgeschieden',
};

// Get zone color based on promotion category (for frontend styling)
function getZoneColor(promotionName: string): string {
    const lowerName = promotionName.toLowerCase();

    if (lowerName.includes('champions league')) return '#0066FF'; // Blue
    if (lowerName.includes('europa league') && !lowerName.includes('conference')) return '#FFB800'; // Orange
    if (lowerName.includes('conference') || lowerName.includes('ecl')) return '#00C853'; // Green
    if (lowerName.includes('relegation playoff')) return '#FF9500'; // Amber
    if (lowerName.includes('degrade') || lowerName === 'relegation') return '#FF3B30'; // Red
    if (lowerName.includes('promoted') || lowerName === 'promotion' || lowerName.includes('direct promotion')) return '#00D26A'; // Green
    if (lowerName.includes('promotion playoff')) return '#5AC8FA'; // Cyan
    if (lowerName.includes('round of 16') || lowerName.includes('knockout')) return '#0066FF'; // Blue
    if (lowerName.includes('eliminated')) return '#8E8E93'; // Gray

    return '#8E8E93'; // Default gray
}

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: leagueId } = await params;
        const seasonId = CURRENT_SEASON_IDS[leagueId];

        if (!seasonId) {
            return NextResponse.json(
                { success: false, error: `No season ID configured for league ${leagueId}` },
                { status: 400 }
            );
        }

        // Fetch standings from TheSports API (includes promotions data)
        const standingsResponse = await fetch(
            `${API_URL}/v1/football/season/recent/table/detail?user=${USERNAME}&secret=${API_KEY}&uuid=${seasonId}`
        );
        const standingsData = await standingsResponse.json();

        // Extract promotions data from API response
        const promotions = standingsData?.results?.promotions || [];
        const tables = standingsData?.results?.tables || [];
        const rows = tables[0]?.rows || [];

        // Build promotion lookup map (promotion_id -> { name, label, color })
        // Use promotion_id as unique zone identifier for individual display
        const promotionMap = new Map<string, { name: string; label: string; color: string }>();
        for (const p of promotions) {
            const label = PROMOTION_LABELS[p.name] || p.name;
            const color = getZoneColor(p.name);
            promotionMap.set(p.id, { name: p.name, label, color });
        }

        if (rows.length === 0) {
            return NextResponse.json({
                success: true,
                data: { standings: [], seasonId, teamsCount: 0, promotions: [] },
            });
        }

        // Get all team IDs from standings
        const teamIds = rows.map((row: any) => row.team_id as string);

        // Fetch team info from Supabase in one query
        const { data: teamsData, error: teamsError } = await supabase
            .from('teams')
            .select('id, name, logo')
            .in('id', teamIds);

        if (teamsError) {
            console.error('Supabase teams fetch error:', teamsError);
        }

        // Build team lookup map
        const teamMap = new Map<string, { name: string; logo: string }>();
        if (teamsData) {
            for (const team of teamsData) {
                teamMap.set(team.id, { name: team.name, logo: team.logo || '' });
            }
        }

        // Build standings with team info and zone from API
        const standings = rows.map((row: any, idx: number) => {
            const teamInfo = teamMap.get(row.team_id) || { name: `Team ${idx + 1}`, logo: '' };
            const position = row.position || idx + 1;

            // Use promotion_id as unique zone identifier
            const promotionInfo = promotionMap.get(row.promotion_id);

            return {
                position,
                team: teamInfo.name,
                logo: teamInfo.logo,
                played: row.total || 0,
                won: row.won || 0,
                drawn: row.draw || 0,
                lost: row.loss || 0,
                goals: `${row.goals || 0}:${row.goals_against || 0}`,
                goalDiff: row.goal_diff || 0,
                points: row.points || 0,
                zone: row.promotion_id || null, // Use promotion_id as unique zone
                zoneLabel: promotionInfo?.label || null,
                zoneColor: promotionInfo?.color || null,
            };
        });

        // Build promotions list for frontend legend (only zones used in this table)
        const usedPromotionIds = new Set(rows.map((r: any) => r.promotion_id).filter(Boolean));
        const uniquePromotions = Array.from(usedPromotionIds).map(id => {
            const info = promotionMap.get(id as string);
            return { zone: id, label: info?.label || '', color: info?.color || '#8E8E93' };
        });

        return NextResponse.json({
            success: true,
            data: {
                standings,
                seasonId,
                teamsCount: standings.length,
                promotions: uniquePromotions,
            },
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Error fetching standings:', error);
        return NextResponse.json(
            { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
