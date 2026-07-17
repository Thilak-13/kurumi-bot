/**
 * Shared purge-session state.
 *
 * Tracks the in-flight /purgeall run per channel:
 *   channelId -> { active: boolean, deleted: number, startTime: number }
 *
 * Both purgeall (writer) and stoppurge (reader/canceller) import this module
 * directly; previously stoppurge reached into the purgeall command module via
 * client.commands.get('purgeall').getPurgeState().
 */
const purgeState = new Map();

module.exports = { purgeState };
