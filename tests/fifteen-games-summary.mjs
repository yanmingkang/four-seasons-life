// Aggregate completed real-browser runs without touching gameplay or saves.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const out = new URL('../test-results/fifteen-games/', import.meta.url);
const files = ['report-1-4-7-10-13.json', 'report-2-5-8-11-14.json', 'report-3-6-9-12-15.json'];
const reports = await Promise.all(files.map(async name => JSON.parse(await fs.readFile(new URL(name, out), 'utf8'))));
assert.ok(reports.every(report => report.passed), 'All browser shards must finish successfully');
const games = reports.flatMap(report => report.games).sort((a, b) => a.game - b.game);
assert.deepEqual(games.map(game => game.game), Array.from({length: 15}, (_, i) => i + 1));
assert.ok(games.every(game => game.passed));
assert.equal(new Set(reports.map(report => report.build.indexSha256)).size, 1, 'One build only');
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
const range = values => ({minimum: Math.min(...values), maximum: Math.max(...values), mean: mean(values)});
const keyCells = [6, 11, 13, 15, 18, 22, 27, 31];
const coverTitles = ['东山再起患难伴侣', '小城慢调生活大师', '商界巨舰独行客', '琴瑟和鸣破局者', '四季行路人'];
const rows = games.map(game => ({
  game: game.game, group: game.support ? 'career-support' : game.strategy,
  talent: game.talent, viewport: game.viewport, turns: game.turns.length,
  seconds: game.durationMilliseconds / 1000, loadSeconds: game.loadMilliseconds / 1000,
  ending: game.ending, endingCell: game.endingCell,
  minimumSettledMood: game.minimumMood, finalMood: game.final.mood,
  minimumMoney: game.minimumMoney, finalMoney: game.final.money,
  maximumFatigue: game.maximumFatigue,
  visitedCells: game.turns.map(turn => turn.cell),
  keyCells: game.turns.map(turn => turn.cell).filter(cell => keyCells.includes(cell)),
  practiceCells: game.turns.map(turn => turn.cell).filter(cell => [11, 13].includes(cell)),
  manualSupport: game.supportActions,
  automaticItems: game.final.life.usedItems.filter(item => item.automatic),
  treeholeUsed: game.final.life.treeholeUsed,
  pages: game.memoryPages.length,
  coverTitle: coverTitles.find(title => game.memoryPages[0].text.includes(title)) ?? null,
  memoryImagesLoaded: game.memoryPages.every(page => page.imgs.every(img => img.loaded)),
  share: game.shareImage ?? null,
  errors: game.errors, rawIssues: game.issues.map(({label, type}) => ({label, type})),
  apiIntercepted: game.apiIntercepted.length,
  externalBlocked: game.externalBlocked.length,
}));
const groups = ['random', 'career', 'boundary', 'career-support'].map(group => {
  const subset = rows.filter(row => row.group === group);
  return {group, count: subset.length, complete: subset.filter(row => row.ending === 'complete').length,
    early: subset.filter(row => row.ending !== 'complete' && row.endingCell < 40).length,
    seconds: range(subset.map(row => row.seconds)), minimumMood: range(subset.map(row => row.minimumSettledMood)),
    finalMood: range(subset.map(row => row.finalMood)),
    actualManualActions: subset.reduce((sum, row) => sum + row.manualSupport.length, 0)};
});
const allTurns = games.flatMap(game => game.turns);
const summary = {
  generatedAt: new Date().toISOString(), passed: true, sourceReports: files,
  build: reports[0].build,
  protocol: {
    independentNewGameUI: true, saveMutation: false, fairSeededDice: true,
    uniqueDiceSequences: new Set(games.map(game => game.seed)).size,
    pairedSequences: [[7, 13], [8, 14], [9, 15]], normalAnimations: true,
    simultaneousBrowsers: 3, desktopGames: 10, simulatedLandscapeGames: 5,
    realModelCalls: 0, realCLICalls: 0,
    note: 'Automated clicks, not human reading time; normal render/animation time plus inspection overhead. Isolated API, no live AI/public link/real-device acceptance.',
    minimumMood: 'Observed saved states before/after choices, after automatic rescues; not a hypothetical pre-rescue trough.',
    supportLimitation: 'Support was attempted only in choice phase. Feedback-phase nudges could be missed. Game 13 used companion only; game 14 used no manual support; game 15 used coffee and companion.',
  },
  totals: {
    count: rows.length, completed: rows.filter(row => row.ending === 'complete').length,
    early: rows.filter(row => row.ending !== 'complete' && row.endingCell < 40).length,
    turns: allTurns.length, turnRange: range(rows.map(row => row.turns)),
    seconds: range(rows.map(row => row.seconds)), loadSeconds: range(rows.map(row => row.loadSeconds)),
    minimumSettledMood: Math.min(...rows.map(row => row.minimumSettledMood)),
    zeroMoneyGames: rows.filter(row => row.minimumMoney === 0).map(row => row.game),
    totalMemoryPages: rows.reduce((sum, row) => sum + row.pages, 0),
    uniqueVisitedCells: [...new Set(rows.flatMap(row => row.visitedCells))].sort((a, b) => a - b),
    coverTitles: Object.fromEntries(coverTitles.map(title => [title, rows.filter(row => row.coverTitle === title).length])),
    allMemoryImagesLoaded: rows.every(row => row.memoryImagesLoaded),
    shares: rows.filter(row => row.share).map(row => ({game: row.game, ...row.share})),
    practiceEventGames: rows.filter(row => row.practiceCells.length).map(row => row.game),
    noPracticeEventGames: rows.filter(row => !row.practiceCells.length).map(row => row.game),
    keyCellCoverage: Object.fromEntries(keyCells.map(cell => [cell, rows.filter(row => row.visitedCells.includes(cell)).length])),
    automaticItemGames: rows.filter(row => row.automaticItems.length).map(row => row.game),
    treeholeGames: rows.filter(row => row.treeholeUsed).map(row => row.game),
    choiceTextCharacters: range(allTurns.map(turn => turn.choiceTextCharacters)),
    feedbackTextCharacters: range(allTurns.map(turn => turn.feedbackTextCharacters)),
    javascriptErrors: rows.flatMap(row => row.errors).length,
    rawIssues: rows.flatMap(row => row.rawIssues).length,
  },
  followUp: {
    file: 'landscape-stable-check.json', notAdditionalGames: true,
    note: 'Five raw first-choice hit-test alerts were sampled during entry. Three recorded scenes were rechecked after 900 ms: all 9 button centers and trial clicks passed. Do not report these as confirmed persistent input failures. Small-screen card scrolling remains necessary.',
    visualFindings: ['Desktop share image preview too small; bottom actions partly below initial fold.', 'Landscape world appearance control occupies the choice-card corner.'],
  }, groups, games: rows,
};
await fs.writeFile(new URL('summary.json', out), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({...summary, games: rows.map(({automaticItems, ...row}) => ({...row, automaticItems: automaticItems.map(item => item.id)}))}, null, 2));
