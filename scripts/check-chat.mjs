#!/usr/bin/env node
/**
 * Chat assistant checks.
 *
 * The assistant routes free text to an intent, and the audit intents read the
 * signed-in account. Both were broken once: "mera profile" was a keyword of
 * the profile *wizard*, so every "is my profile set up?" question started the
 * six-step form instead of showing the report. These checks run the real
 * keyword table and the real scorer, so the same regression cannot return.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(root, 'chat-widget.js');
const src = fs.readFileSync(file, 'utf8');

let failures = 0;
const results = [];
function check(name, ok, detail) {
    results.push({ name, ok, detail });
    if (!ok) failures += 1;
}

/** Slice out a balanced [..] / {..} region, ignoring brackets inside strings. */
function sliceBalanced(text, openIndex) {
    const pairs = { '[': ']', '{': '}', '(': ')' };
    const open = text[openIndex];
    const close = pairs[open];
    if (!close) throw new Error('not a bracket: ' + open);
    let depth = 0;
    let quote = null;
    for (let i = openIndex; i < text.length; i += 1) {
        const ch = text[i];
        const prev = text[i - 1];
        if (quote) {
            if (ch === '\\') { i += 1; continue; }
            if (ch === quote) quote = null;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') { quote = ch; continue; }
        if (ch === '/' && text[i + 1] === '/') { i = text.indexOf('\n', i); if (i < 0) break; continue; }
        if (ch === '/' && text[i + 1] === '*') { i = text.indexOf('*/', i + 2); if (i < 0) break; i += 1; continue; }
        if (ch === open) depth += 1;
        else if (ch === close) {
            depth -= 1;
            if (depth === 0) return text.slice(openIndex, i + 1);
        }
    }
    throw new Error('unbalanced ' + open);
}

// Top-level functions inside the IIFE close with a four-space indent. Using
// that instead of brace counting keeps regex literals such as /\p{M}/u from
// being mistaken for code blocks.
function extractFunction(name) {
    const at = src.indexOf('function ' + name + '(');
    if (at < 0) throw new Error('function not found: ' + name);
    const end = src.indexOf('\n    }', at);
    if (end < 0) throw new Error('function end not found: ' + name);
    return src.slice(at, end + '\n    }'.length);
}

// ---------------------------------------------------------------- keyword table
const kbAt = src.indexOf('var KB = [');
if (kbAt < 0) throw new Error('KB table not found');
const kbSrc = sliceBalanced(src, src.indexOf('[', kbAt));
const sandbox = {
    a: (href, label) => label,
    t: (en) => en,
    L: new Proxy({}, { get: (_, key) => '#' + String(key) }),
    BASE: '',
    console
};
const KB = vm.runInNewContext('(' + kbSrc + ')', sandbox);
const normSrc = extractFunction('norm');
const scoreSrc = extractFunction('score');
const { norm, score } = vm.runInNewContext(
    normSrc + '\n' + scoreSrc + '\n({ norm: norm, score: score })', {}
);

function best(text) {
    let top = null;
    let topScore = 0;
    KB.forEach((intent) => {
        const s = score(text, intent);
        if (s > topScore) { topScore = s; top = intent; }
    });
    return topScore >= 2 ? top.id : null;
}

// ------------------------------------------------------------ intent routing
const routing = [
    ['mera profile kitna set hai', 'profileAudit'],
    ['Pahle ap mera profile dekhen or rwport batayen to', 'profileAudit'],
    ['Dekhiye to mera profile set huwa hai ya nahi to batayen?', 'profileAudit'],
    ['मेरा प्रोफाइल कितना सेटअप हुआ है', 'profileAudit'],
    ['mera profile report do', 'profileAudit'],
    ['check my profile', 'profileAudit'],
    ['mera profile banao', 'buildProfileBot'],
    ['profile update karna hai', 'buildProfileBot'],
    ['mere project me kya kami hai', 'jobAudit'],
    ['project posting me kya kami hai', 'jobAudit'],
    ['job post check karo', 'jobAudit'],
    ['प्रोजेक्ट में क्या कमी है', 'jobAudit'],
    ['resume upload karna hai', 'uploadResumeBot'],
    ['post a job', 'postJobBot'],
    // A service plus a price or timeline question answers the modifier first
    // and appends one line about the service, so either intent is correct.
    ['excel dashboard price', 'excel|pricing'],
    ['pdf design kitne ka hai', 'pdf|pricing'],
    ['how long for a website', 'web|timeline']
];
routing.forEach(([text, want]) => {
    const got = best(text);
    const allowed = want.split('|');
    check('routes "' + text + '" to ' + want, allowed.indexOf(got) > -1, 'got ' + got);
});

// The wizard must not claim the bare "mera profile" / "my profile" phrases
// again; that is what hijacked the status questions.
const buildIntent = KB.find((i) => i.id === 'buildProfileBot');
const buildKw = (buildIntent.kw || []).map((k) => k.toLowerCase().trim());
check('buildProfileBot no longer owns "mera profile"', !buildKw.includes('mera profile'));
check('buildProfileBot no longer owns "my profile"', !buildKw.includes('my profile'));

// --------------------------------------------------------------- privacy guard
const otherAt = src.indexOf('var OTHER_PERSON =');
const privAt = src.indexOf('var PRIVATE_FIELD =');
const ofAt = src.indexOf('var THIRD_PARTY_OF =');
check('privacy guard defines OTHER_PERSON, PRIVATE_FIELD and THIRD_PARTY_OF',
    otherAt > -1 && privAt > -1 && ofAt > -1);

function literalAt(index) {
    const line = src.slice(index, src.indexOf('\n', index));
    return line.slice(line.indexOf('=') + 1).trim().replace(/;$/, '');
}
const OTHER_PERSON = vm.runInNewContext(literalAt(otherAt));
const PRIVATE_FIELD = vm.runInNewContext(literalAt(privAt));
const THIRD_PARTY_OF = vm.runInNewContext(literalAt(ofAt));
const asksAboutSomeoneElse = (text) => THIRD_PARTY_OF.test(text) ||
    (OTHER_PERSON.test(text) && PRIVATE_FIELD.test(text));

const privacy = [
    ['kisi aur ka profile dikhao', true],
    ['uska email batao', true],
    ['uski profile dekhni hai', true],
    ['show me the profile of john', true],
    ['email of the client', true],
    ['किसी और का प्रोफाइल दिखाओ', true],
    ['उसका नंबर बताओ', true],
    ['mera profile kitna set hai', false],
    ['Pahle ap mera profile dekhen or rwport batayen to', false],
    ['number of pages in the deck', false],
    ['uska price kya hai', false],
    ['what is the email of gahonsh', false],
    ['मेरा प्रोफाइल कितना सेट है', false],
    ['project me kya kami hai', false]
];
privacy.forEach(([text, want]) => {
    check('privacy guard ' + (want ? 'blocks' : 'allows') + ' "' + text + '"',
        asksAboutSomeoneElse(text) === want);
});

// The guard must run before intent routing, not after it.
const guardCall = src.indexOf('if (asksAboutSomeoneElse(clean))');
const routingCall = src.indexOf('var ranked = KB.map(');
check('the privacy guard runs before intent routing',
    guardCall > -1 && routingCall > -1 && guardCall < routingCall);

// ------------------------------------------------------------- self-only reads
check('profile audit reads getMyProfile()', /Profiles\.getMyProfile\s*\(/.test(src));
check('job audit reads getMyJobs()', /Jobs\.getMyJobs\s*\(/.test(src));
['getProfileById', 'getProfile(', 'getUserById', 'public_profiles', 'from(\'profiles\')']
    .forEach((forbidden) => {
        check('never reads another account through ' + forbidden, src.indexOf(forbidden) < 0);
    });
check('profile writes go through updateMyProfile()', /Profiles\.updateMyProfile\s*\(/.test(src));

// ------------------------------------------------------------------- step chips
const stepChips = src.match(/setChips\(step\.optional \|\| hasCurrent[\s\S]{0,120}?\);/);
check('every step offers Continue, Skip and Cancel',
    !!stepChips && /continueTask/.test(stepChips[0]) && /skipTask/.test(stepChips[0]) &&
    /cancelTask/.test(stepChips[0]));
check('the Continue chip has a step handler', /function continueTaskStep\(/.test(src));
check('the Continue chip keeps its sign-in behaviour when no task runs',
    /continueTask: function \(\) \{[\s\S]{0,120}?if \(task\) \{ continueTaskStep\(\); return; \}[\s\S]{0,80}?handleContinue\(\);/.test(src));
check('the step hint mentions Continue', /tap Continue to keep it/.test(src));

// ------------------------------------------------------------- greeting detail
check('the greeting lists every gap, not the first two',
    /var gaps = audit\.items\.filter/.test(src) && !/\.slice\(0, 2\)/.test(src));

// ---------------------------------------------------------------------- report
results.forEach((r) => {
    console.log((r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.ok || !r.detail ? '' : ' (' + r.detail + ')'));
});
if (failures) {
    console.error('\nchat check failed: ' + failures + ' case(s)');
    process.exit(1);
}
console.log('\nchat check passed: ' + results.length + ' case(s) verified.');
