import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {CINEMATIC_MANIFEST} from '../src/cinematic-manifest.js';
const ffmpeg=process.env.FFMPEG_PATH||'C:/Users/25293/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/vm/tools/app/ffmpeg/ffmpeg.exe';
const ffprobe=process.env.FFPROBE_PATH||path.join(path.dirname(ffmpeg),'ffprobe.exe');

test('team films preserve complete moving H.264 takes, matching metadata and real audio tracks', {skip:!existsSync(ffmpeg)||!existsSync(ffprobe)},()=>{
  const frameBytes=160*90*3;
  for(const item of CINEMATIC_MANIFEST){
    const file=fileURLToPath(new URL(`../public${item.src}`,import.meta.url));
    const metadata=JSON.parse(execFileSync(ffprobe,['-v','error','-show_entries','stream=codec_type,codec_name,width,height,nb_frames,r_frame_rate,duration:format=duration','-of','json',file],{windowsHide:true,encoding:'utf8'}));
    const video=metadata.streams.find(stream=>stream.codec_type==='video');
    assert.equal(video.codec_name,'h264');assert.ok(video.width>video.height&&video.height>=480,'supplied footage stays landscape');
    assert.equal(video.width,item.width);assert.equal(video.height,item.height);
    const rate=video.r_frame_rate.split('/').map(Number),fps=rate[0]/rate[1],duration=Number(metadata.format.duration),count=Number(video.nb_frames);
    assert.ok(Math.abs(fps-item.fps)<.01,`${item.id}: declared frame rate matches delivery`);
    assert.ok(Math.abs(duration*1000-item.durationMs)<90,`${item.id}: declared duration includes the full take`);
    assert.ok(count>=100&&Math.abs(count/fps-Number(video.duration))<.12,'full frame count is not the legacy 96-frame render');
    assert.equal(metadata.streams.some(stream=>stream.codec_type==='audio'),item.hasAudio);
    const early=Math.floor(count*.15),late=Math.floor(count*.85);
    const frames=execFileSync(ffmpeg,['-v','error','-i',file,'-vf',`select=eq(n\\,${early})+eq(n\\,${late}),scale=160:90`,'-fps_mode','passthrough','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:2*1024*1024});
    assert.equal(frames.length,frameBytes*2);let difference=0;for(let i=0;i<frameBytes;i++)difference+=Math.abs(frames[i]-frames[i+frameBytes]);assert.ok(difference/frameBytes>.2,`${item.id}: independent decoded frame motion ${difference/frameBytes}`);
    const poster=fileURLToPath(new URL(`../public${item.poster}`,import.meta.url));
    const posterFrame=execFileSync(ffmpeg,['-v','error','-i',poster,'-frames:v','1','-vf','scale=160:90','-pix_fmt','rgb24','-f','rawvideo','pipe:1'],{windowsHide:true,maxBuffer:frameBytes*2});
    assert.equal(posterFrame.length,frameBytes,`${item.id}: poster decodes`);
  }
});
