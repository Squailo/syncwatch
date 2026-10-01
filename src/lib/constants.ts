/** Supabase Realtime channel prefix */
export const CHANNEL_NAME = "syncwatch-room";

/**
 * Sync buffer in milliseconds.
 * When the host performs an action, spectators wait until (now + SYNC_BUFFER_MS)
 * to execute it. This ensures all spectators are perfectly synchronized with
 * each other, regardless of individual network latency.
 *
 * The host controls their video directly (0 delay for them).
 * 200ms is enough for Supabase Realtime to deliver the message to all clients,
 * and small enough to be imperceptible.
 */
export const SYNC_BUFFER_MS = 200;
