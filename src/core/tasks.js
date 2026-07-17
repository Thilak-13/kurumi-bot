/**
 * Background task registry.
 *
 * Each task module exposes `init(client)` (returning an engine instance,
 * ideally with a `stop()` method). The registry starts them in order after
 * login and stops them in reverse order on shutdown, replacing the
 * copy-pasted try/catch blocks that used to live in index.js.
 */
class TaskRegistry {
    constructor() {
        this.definitions = [];
        this.instances = [];
    }

    /**
     * @param {string} name       Human-readable name for logs
     * @param {{init: function}} module Task module with init(client)
     */
    register(name, module) {
        this.definitions.push({ name, module });
        return this;
    }

    /**
     * Initialize every registered task. A failing task is logged and skipped —
     * one broken engine must not take the others (or the bot) down.
     */
    async initAll(client) {
        for (const { name, module } of this.definitions) {
            try {
                const instance = await module.init(client);
                this.instances.push({ name, instance });
                console.log(`✅ ${name} initialized`);
            } catch (err) {
                console.error(`Failed to initialize ${name}:`, err.message);
            }
        }
    }

    /**
     * Stop every running task (reverse init order). Errors are logged, never thrown.
     */
    async stopAll() {
        for (const { name, instance } of [...this.instances].reverse()) {
            try {
                if (instance && typeof instance.stop === 'function') {
                    await instance.stop();
                }
            } catch (err) {
                console.error(`Failed to stop ${name}:`, err.message);
            }
        }
        this.instances = [];
    }
}

module.exports = { TaskRegistry };
