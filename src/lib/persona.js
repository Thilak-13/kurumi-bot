/**
 * Persona: Kurumi Tokisaki — "the worst Spirit".
 *
 * Every piece of user-facing text the bot produces goes through (or is styled
 * consistently with) this module. The voice: an old-fashioned, exquisitely
 * polite young lady whose sweetness carries an edge — playful, teasing,
 * gently menacing, never crude, never rushed, never slang.
 *
 * Style rules encoded here:
 *  - Signature tics: "Ara ara", "Kihihi", "Ufufu", trailing ellipses, rare ♡
 *  - Time/clock metaphors everywhere (her power is time itself)
 *  - Menace delivered softly; kindness denied with a fluster
 *  - Short, poised sentences. No caps-lock, no "gonna", no memes.
 */

// Palette: crimson astral dress, gold clockface eye, black shadows.
const colors = {
    crimson: 0xB01E36,   // primary / brand
    gold: 0xD4AF37,      // success — the clock strikes true
    amber: 0xE6A23C,     // warnings — the hands tremble
    blood: 0x7A0C1E,     // errors / danger
    shadow: 0x2B060D,    // ambient / neutral dark
    info: 0xB01E36       // alias, primary crimson
};

function pick(list) {
    return list[Math.floor(Math.random() * list.length)];
}

// --- Phrase pools -----------------------------------------------------------

const denyLines = [
    'Ara ara... reaching for powers that are not yours? How *bold* of you. And how futile.',
    'Kihihi... no, no. That door is locked to you, my dear. Do stop rattling the handle.',
    'My, what lovely ambition. Sadly, this command belongs to those I *permit*. You are not among them... yet.',
    'How curious you are. But curiosity is such a dangerous appetite... and this one is not on your menu.'
];

const errorLines = [
    'Ara... something has gone wrong with the clockwork. Do give me a moment to wind it back.',
    'Kihihi... how embarrassing. The gears slipped. It was not *my* fault, of course.',
    'My apologies — a hand of the clock caught on something. Shall we try again... slowly?',
    'Oh dear. The shadows misbehaved. Even the worst Spirit has her off seconds.'
];

const serverOnlyLines = [
    'Ara ara... whispering to me in private? How forward. This little trick only works inside a server, my dear.',
    'Not here, my dear. Some games are only played where everyone can watch... kihihi.'
];

const workingLines = [
    'Patience... the hands of the clock are turning ♡',
    'Ufufu... watch closely. This will only take a moment of your time.',
    'One second of yours, coming right up... kihihi.'
];

const doneLines = [
    'There. Done — and not a second wasted. Ufufu.',
    'Finished, my dear. My, how time flies when I am enjoying myself.',
    'All tidied up. You may thank me... or better, offer me a little of your time ♡'
];

const footers = [
    'Time is precious... spend it wisely ♡',
    'The worst Spirit, at your service.',
    'Tick, tock... kihihi.',
    'Every second belongs to someone. This one was mine.',
    'Zafkiel keeps perfect time.'
];

// --- Voice helpers ----------------------------------------------------------

const persona = {
    name: 'Kurumi Tokisaki',
    colors,
    pick,

    /** Random permission-denied line. */
    deny: () => pick(denyLines),

    /** Random internal-error line. */
    error: () => pick(errorLines),

    /** Random "server only" line. */
    serverOnly: () => pick(serverOnlyLines),

    /** Random "in progress" flourish. */
    working: () => pick(workingLines),

    /** Random completion flourish. */
    done: () => pick(doneLines),

    /** Random embed footer flourish. */
    footer: () => pick(footers)
};

module.exports = persona;
