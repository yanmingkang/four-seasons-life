// Fifteen new UI journeys: normal animation, isolated browser/server, no real API.
// Optional argument is a comma-separated shard, e.g. 1,4,7,10,13.
process.env.PLAYTEST_SUITE='fifteen';
process.env.TEN_GAMES_GRAPHICS='native';
process.env.TEN_GAMES_CONCURRENCY='1';
if(process.argv[2])process.env.TEN_GAMES=process.argv[2];
await import('./ten-games-browser.mjs');
