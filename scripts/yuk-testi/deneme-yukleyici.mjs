const ch = await import('../../src/api/changes.ts?c=1');
const se = await import('../../src/store/session.ts?c=1');
const pe = await import('../../src/lib/permissions.ts?c=1');
const pc = await import('../../src/api/publishCurriculum.ts?c=1');
const rg = await import('../../src/api/regrade.ts?c=1');
const bs = await import('../../src/lib/boardStats.ts?c=1');
const bd = await import('../../src/lib/badges.ts?c=1');
console.log(Object.keys(ch), Object.keys(bs), Object.keys(bd).slice(0,20));
process.exit(0);
