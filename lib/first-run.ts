// The name of the cookie that hides /today's setup card.
//
// It lives here rather than beside the server action that writes it because a
// `'use server'` file may export nothing but async functions, and both the page
// (which reads the cookie) and the action (which sets it) need the name. One
// string, one place, so the two halves cannot drift apart.
//
// Why a cookie at all: the card disappears on its own the moment there is a
// course and a term, so this only covers the window before that. It is a fact
// about this browser's patience, not about the semester — see docs/DECISIONS.md.
export const FIRST_RUN_COOKIE = 'recalc_setup_skipped';
