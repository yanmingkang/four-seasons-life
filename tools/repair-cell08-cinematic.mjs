// User-authorized local repair of the lower-right cell-08 watermark only.
// Deterministic FFmpeg interpolation; no model, API, browser or credentials.
// Originals and previous integration are read-only. Reruns verify known files.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const BIN='C:/Users/25293/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/vm/tools/app/ffmpeg';
const SOURCE='C:/Users/25293/Desktop/动画/8.楼道吸烟角.mp4';
const INTEGRATED=path.join(ROOT,'public/cinematics/team-20260912/cell-08.mp4');
const TARGET=path.join(ROOT,'public/cinematics/team-20260912-repaired-20260913');
const OUTPUT=path.join(TARGET,'cell-08.mp4'),POSTER=path.join(TARGET,'cell-08-poster.jpg');
const EVIDENCE=path.join(ROOT,'test-results/cinematic-repair');
const REPORT=path.join(EVIDENCE,'cell08-report.json');
const PROFILE=Object.freeze({version:1,repair:'FFmpeg delogo, per-frame surrounding-boundary interpolation',
  roi:{x:1138,y:662,width:128,height:44},filter:'delogo=x=1138:y=662:w=128:h=44',
  video:{codec:'libx264',preset:'slow',crf:18,pixelFormat:'yuv420p',fps:24,width:1280,height:720},
  audio:'none; original has no audio stream',duration:'entire original; no trimming, retiming or frame insertion',
  metadata:'copy original metadata including identical AIGC provenance',faststart:true,posterSeconds:.1});
const digest=data=>createHash('sha256').update(data).digest('hex');
const sha=async file=>digest(await fs.readFile(file));
const exists=async file=>fs.access(file).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
const evidence=name=>path.join(EVIDENCE,`cell08-${name}`);
function run(binary,args,{binaryOutput=false}={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(path.join(BIN,binary),args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
    const chunks=[];let stderr='';const timer=setTimeout(()=>child.kill(),180000);
    child.stdout.on('data',chunk=>chunks.push(chunk));child.stderr.setEncoding('utf8');child.stderr.on('data',s=>stderr+=s);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('close',code=>{clearTimeout(timer);if(code!==0)reject(Error(`${binary} exited ${code}: ${stderr}`));else resolve({stdout:binaryOutput?Buffer.concat(chunks):Buffer.concat(chunks).toString('utf8'),stderr});});
  });
}
const ffmpeg=(args,options)=>run('ffmpeg.exe',['-hide_banner','-nostdin','-v','error','-n',...args],options);
const probe=async file=>JSON.parse((await run('ffprobe.exe',['-v','error','-show_format','-show_streams','-of','json',file])).stdout);
async function frames(file){return JSON.parse((await run('ffprobe.exe',['-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time,duration_time','-of','json',file])).stdout).frames;}
function summary(info){const v=info.streams.find(s=>s.codec_type==='video');return{bytes:Number(info.format.size),duration:Number(info.format.duration),width:v.width,height:v.height,codec:v.codec_name,pixelFormat:v.pix_fmt,fps:v.r_frame_rate,averageFps:v.avg_frame_rate,frames:Number(v.nb_frames),audioStreams:info.streams.filter(s=>s.codec_type==='audio').length,aigc:info.format.tags?.AIGC};}
function mp4Boxes(bytes){const boxes=[];for(let offset=0;offset<bytes.length;){let size=bytes.readUInt32BE(offset);const type=bytes.toString('ascii',offset+4,offset+8);if(size===1)size=Number(bytes.readBigUInt64BE(offset+8));if(size===0)size=bytes.length-offset;assert.ok(size>=8&&offset+size<=bytes.length);boxes.push({type,offset,size});offset+=size;}return boxes;}
async function writeJson(file,value){await fs.writeFile(file,JSON.stringify(value,null,2),{flag:'wx'});}
async function decode(file){const result=await ffmpeg(['-xerror','-i',file,'-map','0:v:0','-f','null','-']);assert.equal(result.stderr.trim(),'');return{passed:true,allFrames:true,stderr:result.stderr};}
async function hashFrames(filter){const result=await ffmpeg(['-i',SOURCE,'-vf',filter,'-fps_mode','passthrough','-f','framemd5','-']);return result.stdout.split(/\r?\n/).filter(line=>line&&!line.startsWith('#')).map(line=>line.split(',').at(-1).trim());}
async function temporal(file,filter=''){
  const width=160,height=80,size=width*height;
  const {stdout:data}=await ffmpeg(['-i',file,'-vf',[filter,'crop=160:80:1120:640','format=gray'].filter(Boolean).join(','),'-fps_mode','passthrough','-f','rawvideo','-'],{binaryOutput:true});
  assert.equal(data.length%size,0);const rows=[];
  for(let frame=0;frame<data.length/size;frame++){
    const offset=frame*size,at=(x,y)=>data[offset+y*width+x];let sum=0,squared=0,count=0,seam=0,seamN=0,seamMax=0,delta=0;
    for(let y=25;y<63;y++)for(let x=21;x<143;x++){const value=at(x,y);sum+=value;squared+=value*value;count++;if(frame)delta+=Math.abs(value-data[offset-size+y*width+x]);}
    const edge=(a,b)=>{const d=Math.abs(a-b);seam+=d;seamN++;seamMax=Math.max(seamMax,d);};
    for(let x=18;x<146;x++){edge(at(x,21),at(x,22));edge(at(x,65),at(x,66));}
    for(let y=22;y<66;y++){edge(at(17,y),at(18,y));edge(at(145,y),at(146,y));}
    rows.push({frame,seconds:frame/24,mean:sum/count,standardDeviation:Math.sqrt(Math.max(0,squared/count-(sum/count)**2)),boundaryMeanAbsoluteDelta:seam/seamN,boundaryMaxDelta:seamMax,previousFrameMeanAbsoluteDelta:frame?delta/count:0});
  }
  return{frames:rows.length,maxBoundaryMeanAbsoluteDelta:Math.max(...rows.map(r=>r.boundaryMeanAbsoluteDelta)),maxBoundaryPixelDelta:Math.max(...rows.map(r=>r.boundaryMaxDelta)),maxPreviousFrameMeanAbsoluteDelta:Math.max(...rows.map(r=>r.previousFrameMeanAbsoluteDelta)),rows};
}

async function main(){
  // No destructive recovery. Any unfamiliar existing final/report is a blocker.
  const profileSha256=digest(JSON.stringify(PROFILE));
  const sourceSha256=await sha(SOURCE),integratedSha256=await sha(INTEGRATED);
  let resumedFrom=null;
  const resumeArgument=process.argv.find(arg=>arg.startsWith('--resume-from='));
  if(resumeArgument){
    const basename=resumeArgument.slice('--resume-from='.length);assert.match(basename,/^cell08-failure-\d+\.json$/);
    const failed=JSON.parse(await fs.readFile(path.join(EVIDENCE,basename),'utf8'));
    assert.equal(failed.passed,false);assert.equal(failed.profileSha256,profileSha256);assert.equal(failed.source.sha256,sourceSha256);assert.equal(failed.integrated.sha256,integratedSha256);
    assert.equal(failed.output.path,OUTPUT);assert.equal(failed.output.sha256,await sha(OUTPUT));assert.equal(await exists(POSTER),false);assert.equal(await exists(REPORT),false);
    resumedFrom=basename;
  }
  if(!resumedFrom&&(await exists(OUTPUT)||await exists(POSTER)||await exists(REPORT))){
    assert.ok(await exists(REPORT),'Output already exists without this script\'s report; refusing overwrite');
    const previous=JSON.parse(await fs.readFile(REPORT,'utf8'));
    assert.equal(previous.passed,true);assert.equal(previous.profileSha256,profileSha256);
    assert.equal(previous.source.sha256,sourceSha256);assert.equal(previous.integrated.sha256,integratedSha256);
    assert.equal(previous.output.sha256,await sha(OUTPUT));assert.equal(previous.poster.sha256,await sha(POSTER));
    await decode(OUTPUT);console.log('VERIFIED: known cell-08 repair; originals/finals unchanged, complete decode passed.');return;
  }
  await fs.mkdir(TARGET,{recursive:true});await fs.mkdir(EVIDENCE,{recursive:true});
  const info=await probe(SOURCE),original=summary(info),integrated=summary(await probe(INTEGRATED));
  assert.equal(original.width,1280);assert.equal(original.height,720);assert.equal(original.fps,'24/1');assert.equal(original.frames,121);assert.equal(original.audioStreams,0);assert.ok(original.aigc);
  const report={passed:false,phase:'encode',profile:PROFILE,profileSha256,scriptSha256:await sha(fileURLToPath(import.meta.url)),
    source:{path:SOURCE,sha256:sourceSha256,...original},integrated:{path:INTEGRATED,sha256:integratedSha256,...integrated},
    authorization:'User confirmed local per-frame patching and right to remove this watermark; AIGC provenance is retained.',
    boundary:'Only cell-08 is written. No source/old-integrated overwrite, manifest changes, API/model/CLI-business calls, or user-server access.',
    ffmpegVersion:(await run('ffmpeg.exe',['-version'])).stdout.split(/\r?\n/)[0]};
  const encodeArgs=['-i',SOURCE,'-map','0:v:0','-an','-vf',PROFILE.filter,'-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-r','24','-fps_mode','cfr','-map_metadata','0','-movflags','+faststart+use_metadata_tags',OUTPUT];
  report.encodeArguments=encodeArgs;
  try{
    if(resumedFrom)report.resumedFrom=resumedFrom;else await ffmpeg(encodeArgs);console.log(resumedFrom?'CELL08 verified and reused own encoded clip':'CELL08 encoded full clip');
    report.output={path:OUTPUT,sha256:await sha(OUTPUT),...summary(await probe(OUTPUT))};
    for(const field of ['width','height','frames','audioStreams','duration','aigc'])assert.equal(report.output[field],original[field],`Preserve ${field}`);
    assert.equal(report.output.codec,'h264');assert.equal(report.output.fps,'24/1');assert.equal(report.output.pixelFormat,'yuv420p');
    report.phase='decode-and-timing';report.decode=await decode(OUTPUT);
    const [inputFrames,outputFrames]=await Promise.all([frames(SOURCE),frames(OUTPUT)]);assert.equal(inputFrames.length,121);assert.equal(outputFrames.length,121);
    const timeline=inputFrames.map((frame,index)=>({frame:index,inputSeconds:Number(frame.best_effort_timestamp_time),outputSeconds:Number(outputFrames[index].best_effort_timestamp_time)}));
    const maxTimestampDifference=Math.max(...timeline.map(frame=>Math.abs(frame.inputSeconds-frame.outputSeconds)));
    assert.ok(maxTimestampDifference<=.000001);report.timeline={frames:121,maxTimestampDifference,frameStep:1/24,rows:timeline};
    const boxes=mp4Boxes(await fs.readFile(OUTPUT));assert.ok(boxes.find(b=>b.type==='moov').offset<boxes.find(b=>b.type==='mdat').offset);report.faststart={passed:true,boxes};
    report.phase='outside-region-preservation';
    // Four non-overlapping regions cover every pixel outside the 2px chroma
    // guard around the ROI. Check every pre-encode decoded frame, not thumbnails.
    report.outsidePreencode=[];
    for(const crop of ['crop=1136:720:0:0','crop=144:660:1136:0','crop=144:12:1136:708','crop=12:48:1268:660']){
      const [before,after]=await Promise.all([hashFrames(crop),hashFrames(`${PROFILE.filter},${crop}`)]);
      assert.equal(before.length,121);assert.deepEqual(after,before);report.outsidePreencode.push({crop,frames:121,allDecodedFrameHashesIdentical:true});
    }
    report.phase='all-frame-boundary-and-temporal-check';
    report.temporal={metric:'8-bit grayscale crop (1120,640) 160x80, all 121 frames; boundary compares adjacent pixels across repair rectangle',
      original:await temporal(SOURCE),preencode:await temporal(SOURCE,PROFILE.filter),encoded:await temporal(OUTPUT)};
    assert.equal(report.temporal.encoded.frames,121);assert.ok(report.temporal.encoded.maxBoundaryMeanAbsoluteDelta<4,'No abrupt repair rectangle boundary');assert.ok(report.temporal.encoded.maxPreviousFrameMeanAbsoluteDelta<4,'No abrupt repair-region temporal flashing');
    report.phase='posters-and-visual-evidence';
    await ffmpeg(['-ss','0.1','-i',OUTPUT,'-frames:v','1','-q:v','2',POSTER]);report.poster={path:POSTER,sha256:await sha(POSTER),seconds:.1};
    report.visualEvidence=[];
    for(const [label,input]of [['before',SOURCE],['after',OUTPUT]]){
      const nativePattern=evidence(`${label}-native-%02d.png`);
      await ffmpeg(['-i',input,'-vf','select=eq(n\\,0)+eq(n\\,60)+eq(n\\,120)','-fps_mode','passthrough',nativePattern]);
      report.visualEvidence.push({label,nativeFrames:[0,60,120].map((frame,index)=>({frame,path:evidence(`${label}-native-${String(index+1).padStart(2,'0')}.png`)}))});
      await ffmpeg(['-i',input,'-vf','crop=160:72:1120:648,tile=11x11:nb_frames=121:padding=1:margin=1:color=gray','-frames:v','1',evidence(`${label}-all121-corners.png`)]);
      await ffmpeg(['-i',input,'-vf','select=not(mod(n\\,10)),scale=320:180,tile=4x4:nb_frames=13:padding=2:margin=2:color=gray','-frames:v','1',evidence(`${label}-story-contact.png`)]);
    }
    // Native decoded original and the previous public integration stay intact.
    assert.equal(await sha(SOURCE),sourceSha256);assert.equal(await sha(INTEGRATED),integratedSha256);
    report.originalsUnchanged=true;report.qualityLimitations=['The removed corner uses per-frame interpolation of surrounding blank background; its original fine noise cannot be recovered.','H.264 is re-encoded once from the original at CRF 18, so decoded pixels outside the local edit may have normal lossy-compression differences. Pre-encode outside-ROI hashes are exact.','No reconstruction of hidden visual content, no new scene generation, no change to subject motion or original source typography.'];
    report.passed=true;report.phase='complete';await writeJson(REPORT,report);
    console.log(JSON.stringify({passed:true,output:report.output,poster:report.poster,temporal:{maxBoundaryMean:report.temporal.encoded.maxBoundaryMeanAbsoluteDelta,maxFrameMeanDelta:report.temporal.encoded.maxPreviousFrameMeanAbsoluteDelta},report:REPORT}));
  }catch(error){report.failure={phase:report.phase,message:error.message,stack:error.stack};const failure=evidence(`failure-${Date.now()}.json`);await writeJson(failure,report);throw error;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
