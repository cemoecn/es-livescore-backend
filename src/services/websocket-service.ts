/**
 * WebSocket Service for TheSports MQTT Real-time Updates
 * Connects to wss://mq.thesports.com for instant match updates
 */

import { supabase } from '@/lib/supabase';
import mqtt, { MqttClient } from 'mqtt';

const MQTT_HOST = process.env.THESPORTS_MQTT_HOST || 'mq.thesports.com';
const MQTT_PORT = process.env.THESPORTS_MQTT_PORT || '8084';
const USERNAME = process.env.THESPORTS_USERNAME || '';
const API_KEY = process.env.THESPORTS_API_KEY || '';

let client: MqttClient | null = null;
let isConnecting = false;

// Topics to subscribe to
// According to TheSports docs, ALL real-time updates (score, status, incidents, stats)
// come through the single match/v1 topic - there is no separate incident topic!
const TOPICS = [
    'thesports/football/match/v1', // ALL live updates: score, status, incidents, stats
];

interface MqttMatchUpdate {
    id: string;
    status_id?: number;
    home_score?: number;
    away_score?: number;
    minute?: number;
    home_team_id?: string;
    away_team_id?: string;
    competition_id?: string;
}

interface MqttIncidentUpdate {
    match_id: string;
    type: number;
    time?: number;
    position?: number;
    player_id?: string;
    player_name?: string;
    player2_id?: string;
    player2_name?: string;
    in_player_id?: string;
    in_player_name?: string;
    out_player_id?: string;
    out_player_name?: string;
    home_score?: number;
    away_score?: number;
    // Assist fields (for goals)
    assist1_id?: string;
    assist1_name?: string;
    // VAR-specific fields (only for type 28)
    var_reason?: number;
    var_result?: number;
}

// Stats format from WebSocket: { type, home, away }
interface MqttStatUpdate {
    type: number;
    home: number;
    away: number;
}

// Status mapping - OFFICIAL TheSports values
// https://www.thesports.com docs
const STATUS_MAP: Record<number, string> = {
    0: 'scheduled',   // Abnormal (suggest hiding)
    1: 'scheduled',   // Not started
    2: 'live',        // First half
    3: 'halftime',    // Half-time
    4: 'live',        // Second half
    5: 'live',        // Overtime
    6: 'live',        // Overtime (deprecated)
    7: 'live',        // Penalty Shoot-out
    8: 'finished',    // End
    9: 'live',        // Delay
    10: 'interrupted',// Interrupt
    11: 'live',       // Cut in half
    12: 'cancelled',  // Cancel
    13: 'scheduled',  // To be determined
};

/**
 * Handle incoming match update
 * Uses UPSERT to prevent race conditions and duplicate key errors
 * 
 * TheSports WebSocket sends data in this format:
 * { id, score: [matchId, statusId, homeScores[], awayScores[], kickoffTimestamp, extra], stats, incidents, tlive }
 * 
 * OFFICIAL Status IDs (from TheSports docs):
 * 0 = Abnormal
 * 1 = Not started
 * 2 = First half
 * 3 = Half-time
 * 4 = Second half
 * 5 = Overtime
 * 6 = Overtime (deprecated)
 * 7 = Penalty Shoot-out
 * 8 = End
 */
async function handleMatchUpdate(data: any) {
    try {
        // Parse the score array if present
        // Format: [matchId, statusId, homeScores[], awayScores[], kickoffTimestamp, extra]
        // According to TheSports docs, position 4 is the kick-off timestamp, NOT the minute!
        // We need to calculate: minute = (now - kickoffTimestamp) / 60000
        // For second half, the kickoffTimestamp is the 2nd half kickoff, so we add 45
        const scoreData = data.score;

        let statusId: number;
        let homeScore: number;
        let awayScore: number;
        let minute: number | null = null;

        if (Array.isArray(scoreData) && scoreData.length >= 5) {
            // New format with score array
            statusId = scoreData[1] ?? 1;
            const homeScores = scoreData[2];
            const awayScores = scoreData[3];
            homeScore = Array.isArray(homeScores) ? (homeScores[0] || 0) : (homeScores || 0);
            awayScore = Array.isArray(awayScores) ? (awayScores[0] || 0) : (awayScores || 0);

            // Position 4: Could be kick-off timestamp OR direct minute value
            // If it's a large number (> 1000000000), it's a Unix timestamp
            // If it's a small number (< 200), it's a direct minute value
            const rawValue = scoreData[4];

            console.log(`[WS] Match ${data.id}: rawValue=${rawValue}, typeof=${typeof rawValue}`);

            if (rawValue !== null && rawValue !== undefined) {
                let parsedMinute: number | null = null;

                if (typeof rawValue === 'number') {
                    if (rawValue > 1000000000) {
                        // It's a Unix timestamp (seconds) - calculate minute using official formula
                        // First half: minute = (now - kickoff) / 60 + 1
                        // Second half: minute = (now - kickoff) / 60 + 45 + 1
                        const kickoffTimestamp = rawValue; // Unix seconds
                        const nowTimestamp = Math.floor(Date.now() / 1000); // Current time in Unix seconds
                        const elapsedSeconds = nowTimestamp - kickoffTimestamp;
                        const elapsedMinutes = Math.floor(elapsedSeconds / 60);

                        // Apply formula based on status
                        if (statusId === 2) {
                            // First half: +1 as per formula
                            parsedMinute = elapsedMinutes + 1;
                        } else if (statusId === 4) {
                            // Second half: +45 +1 as per formula
                            parsedMinute = elapsedMinutes + 45 + 1;
                        } else if (statusId === 5 || statusId === 6) {
                            // Overtime: +90 +1
                            parsedMinute = elapsedMinutes + 90 + 1;
                        } else {
                            parsedMinute = elapsedMinutes + 1;
                        }
                        console.log(`[WS] Timestamp mode: kickoff=${kickoffTimestamp}, now=${nowTimestamp}, elapsed=${elapsedSeconds}s, minute=${parsedMinute}`);
                    } else {
                        // It's a direct minute value - use as is
                        parsedMinute = rawValue;
                    }
                } else if (typeof rawValue === 'string') {
                    // Handle formats like "45+2" -> 47, or just "67" -> 67
                    const str = rawValue;
                    if (str.includes('+')) {
                        const parts = str.split('+');
                        parsedMinute = parseInt(parts[0], 10) + parseInt(parts[1], 10);
                    } else {
                        parsedMinute = parseInt(str, 10);
                    }
                    if (isNaN(parsedMinute)) parsedMinute = null;
                }

                // Final minute assignment based on status
                // (Only needed for direct minute values, timestamp calculations already account for status)
                if (parsedMinute !== null && parsedMinute >= 0) {
                    if (statusId === 3) {
                        // Halftime - don't show a minute
                        minute = null;
                    } else if (statusId === 7 || statusId === 8) {
                        // Penalties or End - no minute needed
                        minute = null;
                    } else if (rawValue > 1000000000) {
                        // Already calculated with status offset above
                        minute = parsedMinute;
                    } else {
                        // Direct minute value - apply status offset
                        if (statusId === 4) {
                            minute = parsedMinute + 45;
                        } else if (statusId === 5 || statusId === 6) {
                            minute = parsedMinute + 90;
                        } else {
                            minute = parsedMinute;
                        }
                    }
                }
            }

            console.log(`[WS] Match ${data.id}: statusId=${statusId}, rawValue=${JSON.stringify(rawValue)}, finalMinute=${minute}`);
        } else {
            // No score array - skip this update to avoid overwriting valid data
            // The API sometimes sends updates without the score array
            console.log(`[WS] Match ${data.id}: No score array, skipping update`);
            return; // DON'T update the database with incomplete data
        }

        const status = STATUS_MAP[statusId] || 'unknown';

        // IMPORTANT: TheSports MQTT sends duplicate/stale messages
        // We validate that score doesn't decrease UNLESS there's a VAR event
        const { data: currentMatch } = await supabase
            .from('matches')
            .select('home_score, away_score')
            .eq('id', data.id)
            .single();

        if (currentMatch) {
            const currentTotal = (currentMatch.home_score || 0) + (currentMatch.away_score || 0);
            const newTotal = homeScore + awayScore;

            // If new score is LOWER, check for VAR events that cancelled a goal
            if (newTotal < currentTotal) {
                // Check for VAR incidents with var_result = 2 (Goal cancelled) or 4 (Penalty cancelled)
                // Type 28 = VAR (Video Assistant Referee)
                const { data: varEvents } = await supabase
                    .from('match_events')
                    .select('type, time, var_reason, var_result')
                    .eq('match_id', data.id)
                    .eq('type', 28)  // VAR incident
                    .in('var_result', [2, 4])  // 2=Goal cancelled, 4=Penalty cancelled
                    .order('time', { ascending: false })
                    .limit(1);

                if (varEvents && varEvents.length > 0) {
                    // VAR cancelled a goal - allow score reduction
                    const resultText = varEvents[0].var_result === 2 ? 'Goal cancelled' : 'Penalty cancelled';
                    console.log(`[WS] Match ${data.id}: Allowing VAR score reduction (${homeScore}-${awayScore}), ${resultText} at ${varEvents[0].time}'`);
                } else {
                    // No valid VAR cancellation - block as stale MQTT message
                    console.log(`[WS] Match ${data.id}: Blocking stale update (${homeScore}-${awayScore} < current ${currentMatch.home_score}-${currentMatch.away_score}) - no VAR cancellation`);
                    return;
                }
            }
        }

        console.log(`[WS] Match ${data.id}: ${status}, score=${homeScore}-${awayScore}, minute=${minute}`);

        // Use UPDATE (not UPSERT) - only update existing matches
        // New matches with full team data come from the daily CRON sync
        // WebSocket only updates: status, minute, score, updated_at
        const { error, count } = await supabase
            .from('matches')
            .update({
                status: status,
                minute: minute,
                home_score: homeScore,
                away_score: awayScore,
                updated_at: new Date().toISOString(),
            })
            .eq('id', data.id);

        if (error) {
            console.error('[WS] Match update error:', error.message);
        } else if (count === 0) {
            // Match doesn't exist yet - it will be created by daily sync
            console.log(`[WS] Match ${data.id}: Not in DB yet, waiting for daily sync`);
        }
    } catch (error) {
        console.error('[WS] Error handling match update:', error);
    }
}

/**
 * Handle incoming incidents message
 * The WebSocket sends the COMPLETE list of incidents for a match on each update
 * So we need to REPLACE all events for that match, not append
 */
async function handleIncidentsMessage(matchId: string, incidents: MqttIncidentUpdate[]) {
    try {
        if (!matchId || !incidents || incidents.length === 0) {
            return;
        }

        console.log(`[WS] Processing ${incidents.length} incidents for match ${matchId}`);

        // Strategy: Delete all existing events for this match, then insert fresh ones
        // This ensures we always have the correct, deduplicated list

        // Step 1: Delete all existing events for this match
        const { error: deleteError } = await supabase
            .from('match_events')
            .delete()
            .eq('match_id', matchId);

        if (deleteError) {
            console.error(`[WS] Error deleting old events for ${matchId}:`, deleteError.message);
            // Continue anyway to try inserting
        }

        // Step 2: Insert all new events
        const eventsToInsert = incidents.map(incident => ({
            match_id: matchId,
            type: incident.type,
            time: incident.time ?? null,
            position: incident.position ?? null,
            player_id: incident.player_id ?? null,
            player_name: incident.player_name ?? null,
            player2_id: incident.player2_id ?? null,
            player2_name: incident.player2_name ?? null,
            in_player_id: incident.in_player_id ?? null,
            in_player_name: incident.in_player_name ?? null,
            out_player_id: incident.out_player_id ?? null,
            out_player_name: incident.out_player_name ?? null,
            home_score: incident.home_score ?? null,
            away_score: incident.away_score ?? null,
            // Assist fields
            assist1_id: incident.assist1_id ?? null,
            assist1_name: incident.assist1_name ?? null,
            // VAR-specific fields
            var_reason: incident.var_reason ?? null,
            var_result: incident.var_result ?? null,
        }));

        const { error: insertError } = await supabase
            .from('match_events')
            .insert(eventsToInsert);

        if (insertError) {
            console.error(`[WS] Error inserting events for ${matchId}:`, insertError.message);
        } else {
            console.log(`[WS] ✓ Synced ${incidents.length} events for match ${matchId}`);
        }

        // Update match score from the latest goal incident
        // Type 1 = Goal, Type 8 = Penalty (also counts as goal)
        const goalIncidents = incidents.filter(i => i.type === 1 || i.type === 8);
        if (goalIncidents.length > 0) {
            const lastGoal = goalIncidents[goalIncidents.length - 1];
            if (lastGoal.home_score !== undefined && lastGoal.away_score !== undefined) {
                await supabase
                    .from('matches')
                    .update({
                        home_score: lastGoal.home_score,
                        away_score: lastGoal.away_score,
                        updated_at: new Date().toISOString(),
                    })
                    .eq('id', matchId);
            }
        }
    } catch (error) {
        console.error('[WS] Error handling incidents:', error);
    }
}

/**
 * Handle incoming stats message
 * Stats format: [{ type, home, away }, ...]
 * Upserts to match_stats table for real-time updates
 */
async function handleStatsMessage(matchId: string, stats: MqttStatUpdate[]) {
    try {
        if (!matchId || !stats || stats.length === 0) {
            return;
        }

        console.log(`[WS] Processing ${stats.length} stats for match ${matchId}`);

        // Upsert each stat
        const statsToUpsert = stats.map(stat => ({
            match_id: matchId,
            stat_type: stat.type,
            home_value: stat.home || 0,
            away_value: stat.away || 0,
            period: 'full',
            updated_at: new Date().toISOString(),
        }));

        const { error } = await supabase
            .from('match_stats')
            .upsert(statsToUpsert, {
                onConflict: 'match_id,stat_type,period',
            });

        if (error) {
            console.error(`[WS] Error upserting stats for ${matchId}:`, error.message);
        } else {
            console.log(`[WS] ✓ Updated ${stats.length} stats for match ${matchId}`);
        }
    } catch (error) {
        console.error('[WS] Error handling stats:', error);
    }
}

/**
 * Connect to MQTT broker
 */
export function connectMqtt(): Promise<void> {
    return new Promise((resolve, reject) => {
        if (client?.connected) {
            console.log('[WS] Already connected');
            resolve();
            return;
        }

        if (isConnecting) {
            console.log('[WS] Connection already in progress');
            resolve();
            return;
        }

        if (!USERNAME || !API_KEY) {
            console.warn('[WS] MQTT credentials not configured. Skipping WebSocket connection.');
            resolve();
            return;
        }

        isConnecting = true;
        const url = `wss://${MQTT_HOST}:${MQTT_PORT}/mqtt`;

        console.log(`[WS] Connecting to ${url}...`);

        client = mqtt.connect(url, {
            username: USERNAME,
            password: API_KEY,
            clientId: `es-livescore-${Date.now()}`,
            clean: true,
            reconnectPeriod: 5000,
            connectTimeout: 30000,
            protocolVersion: 4,
            // Skip SSL certificate verification (TheSports uses a cert that can't be verified)
            rejectUnauthorized: false,
        });

        client.on('connect', () => {
            console.log('[WS] Connected to TheSports MQTT!');
            isConnecting = false;

            // Subscribe to topics
            TOPICS.forEach(topic => {
                client?.subscribe(topic, { qos: 1 }, (err) => {
                    if (err) {
                        console.error(`[WS] Failed to subscribe to ${topic}:`, err);
                    } else {
                        console.log(`[WS] Subscribed to ${topic}`);
                    }
                });
            });

            resolve();
        });

        client.on('message', (topic, message) => {
            try {
                const data = JSON.parse(message.toString());

                // All updates come via thesports/football/match/v1 topic
                // Each message contains: id, score, stats, incidents, tlive
                const updates = Array.isArray(data) ? data : [data];

                for (const update of updates) {
                    const matchId = update.id;
                    if (!matchId) continue;

                    // Handle match score/status updates
                    handleMatchUpdate(update);

                    // Handle incidents if present in this update
                    if (update.incidents && Array.isArray(update.incidents) && update.incidents.length > 0) {
                        console.log(`[WS] Match ${matchId} has ${update.incidents.length} incidents`);
                        handleIncidentsMessage(matchId, update.incidents);
                    }

                    // Handle stats if present in this update
                    if (update.stats && Array.isArray(update.stats) && update.stats.length > 0) {
                        console.log(`[WS] Match ${matchId} has ${update.stats.length} stats`);
                        handleStatsMessage(matchId, update.stats);
                    }
                }
            } catch (error) {
                console.error('[WS] Error parsing message:', error);
            }
        });

        client.on('error', (error) => {
            console.error('[WS] Connection error:', error);
            isConnecting = false;
        });

        client.on('close', () => {
            console.log('[WS] Connection closed');
            isConnecting = false;
        });

        client.on('reconnect', () => {
            console.log('[WS] Reconnecting...');
        });

        // Timeout if connection takes too long
        setTimeout(() => {
            if (isConnecting) {
                isConnecting = false;
                console.warn('[WS] Connection timeout - continuing with HTTP polling');
                resolve();
            }
        }, 10000);
    });
}

/**
 * Disconnect from MQTT broker
 */
export function disconnectMqtt(): Promise<void> {
    return new Promise((resolve) => {
        if (client) {
            client.end(true, {}, () => {
                console.log('[WS] Disconnected');
                client = null;
                resolve();
            });
        } else {
            resolve();
        }
    });
}

/**
 * Check if connected
 */
export function isConnected(): boolean {
    return client?.connected || false;
}

export const WebSocketService = {
    connect: connectMqtt,
    disconnect: disconnectMqtt,
    isConnected,
};

export default WebSocketService;
