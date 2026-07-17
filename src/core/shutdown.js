/**
 * Graceful shutdown.
 *
 * Handles SIGINT (Ctrl-C) and — new — SIGTERM, which is what Docker sends on
 * `docker stop` / `docker compose down`. Previously only SIGINT was handled,
 * so production containers were always killed hard after the grace period.
 *
 * Order: stop background tasks → close database → destroy client → exit.
 */
function installShutdownHandlers(client, taskRegistry) {
    let shuttingDown = false;

    const shutdown = async (signal) => {
        if (shuttingDown) return;
        shuttingDown = true;

        console.log(`\n🛑 Shutting down (${signal})...`);

        try {
            await taskRegistry.stopAll();
        } catch (err) {
            console.error('Error stopping background tasks:', err.message);
        }

        if (client.database?.connected) {
            await client.database.disconnect();
        }

        client.destroy();
        process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

module.exports = { installShutdownHandlers };
