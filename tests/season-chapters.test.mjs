import test from 'node:test';
import assert from 'node:assert/strict';
import {LIFE_CHAPTERS,chaptersBetween} from '../src/season-chapters.js';
import {SEASON_WEATHER,WEATHER_BANDS,seasonWeatherParticles} from '../src/pixel-world.js';

test('four concise chapters describe growth, with winter as independent life',()=>{
  assert.deepEqual(LIFE_CHAPTERS.map(c=>c.name),['春','夏','秋','冬']);
  assert.deepEqual(LIFE_CHAPTERS.map(c=>c.stage),['初入社会','努力打拼','重新选择','独立生活']);
  assert.ok(LIFE_CHAPTERS.every(c=>c.caption.length<20&&Object.isFrozen(c)));
  assert.deepEqual(LIFE_CHAPTERS.map(c=>c.weather),SEASON_WEATHER);
});

test('chapters include all newly entered seasons, not the prior one',()=>{
  assert.deepEqual(chaptersBetween(-1,0),[0]);
  assert.deepEqual(chaptersBetween(0,1),[1]);
  assert.deepEqual(chaptersBetween(0,3),[1,2,3]);
  assert.deepEqual(chaptersBetween(-1,3),[0,1,2,3]);
  assert.deepEqual(chaptersBetween(2,2),[]);
  assert.deepEqual(chaptersBetween(3,0),[]);
  assert.deepEqual(chaptersBetween(-30,20),[0,1,2,3]);
  assert.deepEqual(chaptersBetween(0,NaN),[]);
  assert.deepEqual(chaptersBetween(2,Infinity),[]);
});

test('weather particles are deterministic, bounded to their own season, and varied',()=>{
  for(let season=0;season<4;season++){
    assert.deepEqual(seasonWeatherParticles(season,1200),seasonWeatherParticles(season,1200));
    assert.notDeepEqual(seasonWeatherParticles(season,1200),seasonWeatherParticles(season,2400));
    for(const time of [0,15,800,2400,30000,3600000])for(const p of seasonWeatherParticles(season,time)){
      assert.ok(p.x>=0&&p.x<=1500);assert.ok(p.y>=WEATHER_BANDS[season].top&&p.y<WEATHER_BANDS[season].bottom);
      assert.ok(p.size>=2&&p.size<=5);
    }
  }
  assert.equal(new Set(SEASON_WEATHER).size,4);
  assert.ok(seasonWeatherParticles(3).length>seasonWeatherParticles(0).length);
  assert.deepEqual(seasonWeatherParticles(-1),[]);assert.deepEqual(seasonWeatherParticles(6),[]);
});

test('reduced motion and invalid clocks freeze weather in a stable visible scene',()=>{
  for(let season=0;season<4;season++){
    const stable=seasonWeatherParticles(season,0);
    assert.deepEqual(seasonWeatherParticles(season,Infinity),stable);
    assert.deepEqual(seasonWeatherParticles(season,-1),stable);
    assert.deepEqual(seasonWeatherParticles(season,123456,{motion:false}),stable);
  }
});
