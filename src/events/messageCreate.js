/**
 * messageCreate Event Handler (prefix commands)
 * Thin delegate — the actual pipeline lives in src/core/dispatcher.js
 */

const { dispatchPrefixCommand } = require('../core/dispatcher');

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        await dispatchPrefixCommand(message);
    }
};
