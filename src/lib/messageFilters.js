/**
 * Shared message-filter predicates.
 * Single source of truth for the content filters used by /purgeall and the
 * autopurge engine. Semantics are preserved exactly from the original
 * duplicated switch statements.
 */

// Choice list used by slash-command options and legacy arg validation.
const filterChoices = [
    { name: 'All Messages', value: 'all' },
    { name: 'Images', value: 'image' },
    { name: 'Videos', value: 'video' },
    { name: 'Links', value: 'link' },
    { name: 'Files', value: 'file' },
    { name: 'Embeds', value: 'embed' },
    { name: 'Sounds/Voice', value: 'sound' },
    { name: 'Polls', value: 'poll' },
    { name: 'Stickers', value: 'sticker' },
    { name: 'Emojis', value: 'emoji' }
];

/**
 * Test a single filter value against a message.
 * 'all' matches everything; unknown filters match nothing.
 */
function matchesFilter(message, filter) {
    switch (filter) {
        case 'all':
            return true;
        case 'image': {
            const hasImgAttach = message.attachments.some(att => att.contentType?.startsWith('image/'));
            const hasImgEmbed = message.embeds.some(emb => emb.type === 'image' || emb.image);
            return hasImgAttach || hasImgEmbed;
        }
        case 'video': {
            const hasVidAttach = message.attachments.some(att => att.contentType?.startsWith('video/'));
            const hasVidEmbed = message.embeds.some(emb => emb.type === 'video' || emb.video);
            return hasVidAttach || hasVidEmbed;
        }
        case 'link':
            return /https?:\/\/[^\s]+/i.test(message.content);
        case 'file':
            return message.attachments.some(att => {
                const type = att.contentType;
                return !type?.startsWith('image/') && !type?.startsWith('video/') && !type?.startsWith('audio/');
            });
        case 'embed':
            return message.embeds.length > 0;
        case 'sound':
            return message.attachments.some(att => att.contentType?.startsWith('audio/') || att.contentType?.startsWith('voice/'));
        case 'poll':
            return !!message.poll;
        case 'sticker':
            return message.stickers.size > 0;
        case 'emoji': {
            const hasCustomEmoji = /<a?:[a-zA-Z0-9_]+:\d+>/g.test(message.content);
            const hasUnicodeEmoji = /\p{Extended_Pictographic}/u.test(message.content);
            return hasCustomEmoji || hasUnicodeEmoji;
        }
        default:
            return false;
    }
}

/**
 * Autopurge-engine semantics: system messages never match, an empty filter
 * list matches everything, otherwise any filter in the list may match.
 */
function matchesAnyFilter(message, filters) {
    if (message.system) return false;
    if (filters.length === 0) return true;
    return filters.some(filter => matchesFilter(message, filter));
}

module.exports = { filterChoices, matchesFilter, matchesAnyFilter };
