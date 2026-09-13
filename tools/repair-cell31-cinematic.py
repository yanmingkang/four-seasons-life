"""User-authorized, offline paper-title repair. Never modifies the team original.

Python requirements: bundled numpy and Pillow; FFmpeg/FFprobe provided separately.
Inspection and repair are deliberately limited to cell 31, not arbitrary uploads.
"""
from pathlib import Path
import argparse
import hashlib
import json
import subprocess
import tempfile
from collections import deque
from datetime import datetime, timezone
import struct
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SOURCE = Path('C:/Users/25293/Desktop/动画/31.人事办公室.mp4')
OLD = ROOT / 'public/cinematics/team-20260912/cell-31.mp4'
TARGET = ROOT / 'public/cinematics/team-20260912-repaired-20260913'
REPORTS = ROOT / 'test-results/cinematic-repair'
BIN = Path('C:/Users/25293/AppData/Roaming/TRAE SOLO CN/ModularData/ai-agent/vm/tools/app/ffmpeg')
FONT = Path('C:/Windows/Fonts/msyh.ttc')
CREATION_FLAGS = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
# Inspected, frame-indexed paper corners: top-left, top-right, bottom-right,
# bottom-left in the original 1280 x 720 image. These are tracking priors, not
# screen-space text positions; per-frame paper edges refine every estimate.
KEYFRAMES = {
    0: [[657,305],[773,351],[667,429],[544,377]],
    10: [[659,305],[770,350],[662,429],[544,376]],
    20: [[667,309],[773,348],[664,430],[548,376]],
    30: [[681,293],[798,325],[695,416],[575,365]],
    40: [[695,269],[808,312],[714,399],[594,352]],
    50: [[675,258],[791,293],[705,392],[592,358]],
    60: [[647,274],[759,307],[674,405],[557,361]],
    70: [[621,278],[732,317],[653,429],[535,382]],
    80: [[624,286],[732,324],[651,432],[533,385]],
    90: [[623,285],[733,324],[651,432],[534,385]],
    100: [[623,283],[733,322],[651,432],[534,387]],
    110: [[623,285],[733,323],[651,433],[534,385]],
    120: [[623,284],[733,323],[651,432],[534,385]],
}


def paper_prior(index):
    a = min(110, index // 10 * 10)
    ratio = (index - a) / 10
    return np.array(KEYFRAMES[a]) * (1-ratio) + np.array(KEYFRAMES[a+10]) * ratio


def fit_edge(frame, start, end, center):
    tangent = (end-start) / np.linalg.norm(end-start)
    normal = np.array([-tangent[1], tangent[0]])
    if np.dot(normal, center-(start+end)/2) < 0:
        normal *= -1
    hits = []
    for t in np.linspace(.10, .90, 65):
        base = start*(1-t) + end*t
        candidates = base + np.arange(-15,16)[:, None]*normal
        inside = np.round(candidates + normal*3).astype(int)
        outside = np.round(candidates - normal*3).astype(int)
        a = frame[inside[:,1], inside[:,0]].astype(float)
        b = frame[outside[:,1], outside[:,0]].astype(float)
        valid = (np.min(a, axis=1)>207) & (b[:,2]<193)
        score = a[:,2]-b[:,2] - np.abs(np.arange(-15,16))*.3
        score[~valid] = -999
        best = np.argmax(score)
        if score[best] > 30:
            hits.append(candidates[best])
    pts = np.array(hits)
    if len(pts)<12:
        return [float(normal[0]),float(normal[1]),float(-np.dot(normal,start))], 0
    # Deterministic bounded RANSAC rejects fingers, shadows and desk objects.
    best = np.zeros(len(pts), dtype=bool)
    for i in range(0,len(pts),4):
        for j in range(i+8,len(pts),4):
            direction = pts[j]-pts[i]
            if np.linalg.norm(direction) < 20:
                continue
            n = np.array([-direction[1],direction[0]])/np.linalg.norm(direction)
            inliers = np.abs((pts-pts[i]) @ n)<1.5
            if inliers.sum()>best.sum():
                best = inliers
    chosen = pts[best]
    if len(chosen)<12:
        return [float(normal[0]),float(normal[1]),float(-np.dot(normal,start))], 0
    midpoint = chosen.mean(axis=0)
    _,_,v = np.linalg.svd(chosen-midpoint)
    n = v[-1]
    return [float(n[0]),float(n[1]),float(-np.dot(n,midpoint))], int(len(chosen))


def track_paper(frame, index):
    prior = paper_prior(index)
    edges, coverage = [], []
    for i in range(4):
        line, count = fit_edge(frame,prior[i],prior[(i+1)%4],prior.mean(axis=0))
        edges.append(line)
        coverage.append(count)
    corners = []
    for i in range(4):
        a,b = np.array(edges[(i-1)%4]),np.array(edges[i])
        point = np.cross(a,b)
        point = point[:2]/point[2]
        if np.linalg.norm(point-prior[i])>24:
            raise ValueError(f'Frame {index}: implausible corner tracking')
        corners.append(point)
    return np.array(corners), coverage


def homography(source, target):
    equations,values = [],[]
    for (x,y),(u,v) in zip(source,target):
        equations.extend([[x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]])
        values.extend([u,v])
    return np.append(np.linalg.solve(equations,values),1).reshape(3,3)


def rectified(frame, quad):
    size = (240,300)
    matrix = homography([[0,0],[240,0],[240,300],[0,300]],quad)
    return Image.fromarray(frame).transform(size, Image.Transform.PERSPECTIVE,
             tuple(matrix.flatten()[:8]), resample=Image.Resampling.BICUBIC)


def inspect_tracks():
    REPORTS.mkdir(parents=True, exist_ok=True)
    sequence,_ = frames(SOURCE)
    tracks=[]
    for index, frame in enumerate(sequence):
        quad,coverage=track_paper(frame,index)
        tracks.append({'frame':index,'quad':quad.tolist(),'edgeSamples':coverage})
    with (REPORTS/'cell31-tracks-inspection.json').open('w',encoding='utf-8') as f:
        json.dump(tracks,f,indent=2)
    for group in range(2):
        sheet=Image.new('RGB',(1200,1600),'#eee8dd')
        indices=list(range(group*60,min(len(sequence),(group+1)*60+1),10))
        for n,index in enumerate(indices):
            quad=np.array(tracks[index]['quad'])
            scene=Image.fromarray(sequence[index])
            draw=ImageDraw.Draw(scene)
            draw.line([tuple(p) for p in [*quad,quad[0]]],fill='#00ff88',width=1)
            crop=scene.crop((500,240,825,460)).resize((390,264))
            ox,oy=(n%2)*600,(n//2)*400
            sheet.paste(crop,(ox,oy+30))
            paper=rectified(sequence[index],quad).resize((200,250))
            sheet.paste(paper,(ox+395,oy+30))
            ImageDraw.Draw(sheet).text((ox+5,oy+8),f"FRAME {index} edge samples {tracks[index]['edgeSamples']}",fill='black')
        sheet.save(REPORTS/f'cell31-tracked-sheet-{group}.png')
    print(json.dumps({'frames':len(tracks),'fallbackEdges':sum(c==0 for t in tracks for c in t['edgeSamples'])}))


def boundary_skin(rgb, u, v):
    """Preserve the fingers touching the top and right paper edges."""
    r,g,b=np.moveaxis(rgb.astype(float),-1,0)
    allowed=(r>135)&(g>65)&(b>45)&(r-g>30)&(r-b>32)
    allowed &= (v<.28)&((u<.24)|(u>.82))
    seeds=allowed&((v<.045)|(u<.025)|(u>.975))
    seen=np.zeros(allowed.shape,dtype=bool)
    queue=deque(zip(*np.where(seeds)))
    while queue:
        y,x=queue.popleft()
        if y<0 or x<0 or y>=allowed.shape[0] or x>=allowed.shape[1] or seen[y,x] or not allowed[y,x]:
            continue
        seen[y,x]=True
        queue.extend([(y-1,x),(y+1,x),(y,x-1),(y,x+1)])
    return np.array(Image.fromarray(seen.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(5)))>0


def title_layer():
    image=Image.new('RGBA',(480,600),(0,0,0,0))
    d=ImageDraw.Draw(image)
    heading=ImageFont.truetype(str(FONT.with_name('msyhbd.ttc')),86)
    # A neutral, unsigned discussion document; does not pre-empt the choice.
    d.text((240,150),'协商方案',font=heading,fill=(113,56,54,255),anchor='mm')
    d.line((85,229,395,229),fill=(158,141,135,220),width=2)
    return image


def repair_frame(frame,quad,layer):
    # Work in a small native-resolution ROI. Outside it, decoded source pixels
    # remain byte-identical before the final H.264 encode.
    x0,y0=np.floor(quad.min(axis=0)-4).astype(int)
    x1,y1=np.ceil(quad.max(axis=0)+4).astype(int)
    rgb=frame[y0:y1,x0:x1].copy()
    yy,xx=np.mgrid[y0:y1,x0:x1]
    matrix=homography(quad,[[0,0],[1,0],[1,1],[0,1]])
    denom=matrix[2,0]*xx+matrix[2,1]*yy+1
    u=(matrix[0,0]*xx+matrix[0,1]*yy+matrix[0,2])/denom
    v=(matrix[1,0]*xx+matrix[1,1]*yy+matrix[1,2])/denom
    region=(u>.075)&(u<.94)&(v>.07)&(v<.565)
    protected=boundary_skin(rgb,u,v)
    r,g,b=np.moveaxis(rgb.astype(float),-1,0)
    ink=region&(~protected)&(r-g>9)&(r-b>9)
    cleanup=Image.fromarray(ink.astype(np.uint8)*255).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(.6))
    alpha=np.array(cleanup).astype(float)/255
    alpha*=region&~protected
    # Fit the actual paper lighting rather than painting a flat white box.
    clean=(u>.035)&(u<.965)&(v>.04)&(v<.57)&(np.min(rgb,axis=2)>215)&((np.max(rgb,axis=2)-np.min(rgb,axis=2))<28)
    design=np.stack([np.ones_like(u),u,v],axis=-1)
    coefficients=np.linalg.lstsq(design[clean],rgb[clean],rcond=None)[0]
    paper=np.clip(design @ coefficients,0,255)
    repaired=rgb*(1-alpha[...,None])+paper*alpha[...,None]
    # The title is mapped through the current paper homography, never HUD text.
    to_layer=matrix.copy()
    to_layer[0,:]*=480
    to_layer[1,:]*=600
    translation=np.array([[1,0,x0],[0,1,y0],[0,0,1]])
    local=to_layer@translation
    local/=local[2,2]
    label=np.array(layer.transform((x1-x0,y1-y0),Image.Transform.PERSPECTIVE,
                   tuple(local.flatten()[:8]),resample=Image.Resampling.BICUBIC))
    label_alpha=label[:,:,3]/255 * (~protected) * region
    repaired=repaired*(1-label_alpha[...,None])+label[:,:,:3]*label_alpha[...,None]
    result=frame.copy()
    result[y0:y1,x0:x1]=np.clip(np.round(repaired),0,255).astype(np.uint8)
    changes=np.any(result!=frame,axis=2)
    return result,{'changedPixels':int(changes.sum()),'protectedPixels':int(protected.sum()),
                   'roi':[int(x0),int(y0),int(x1),int(y1)],'allChangesInsidePaper':bool(np.all(~changes[y0:y1,x0:x1]|region))}


def render_preview():
    REPORTS.mkdir(parents=True,exist_ok=True)
    staging=Path(tempfile.mkdtemp(prefix='cell31-preview-',dir=REPORTS))
    sequence,_=frames(SOURCE)
    layer=title_layer()
    tracks=[]
    repaired=[]
    for index,frame in enumerate(sequence):
        quad,coverage=track_paper(frame,index)
        output,stats=repair_frame(frame,quad,layer)
        tracks.append({'frame':index,'quad':quad.tolist(),'edgeSamples':coverage,**stats})
        repaired.append(output)
    for group in range(3):
        sheet=Image.new('RGB',(1200,1200),'#eee8dd')
        for n,index in enumerate(range(group*40,min(len(sequence),(group+1)*40),5)):
            ox,oy=(n%2)*600,(n//2)*300
            for side,source in enumerate([sequence[index],repaired[index]]):
                crop=Image.fromarray(source).crop((510,250,820,450)).resize((300,194))
                sheet.paste(crop,(ox+side*300,oy+26))
            ImageDraw.Draw(sheet).text((ox+7,oy+8),f'FRAME {index}   ORIGINAL / REPAIRED',fill='black')
        sheet.save(staging/f'before-after-{group}.png')
    for index in [0,30,50,70,120]:
        Image.fromarray(repaired[index]).save(staging/f'after-native-{index}.png')
    with (staging/'tracks.json').open('w',encoding='utf-8') as f:
        json.dump(tracks,f,indent=2)
    print(staging)
    return staging,sequence,repaired,tracks


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def faststart(path):
    content=path.read_bytes()
    boxes=[]
    offset=0
    while offset+8<=len(content):
        size,kind=struct.unpack('>I4s',content[offset:offset+8])
        if size==1:
            size=struct.unpack('>Q',content[offset+8:offset+16])[0]
        elif size==0:
            size=len(content)-offset
        if size<8 or offset+size>len(content):
            raise ValueError('Invalid MP4 box')
        boxes.append({'type':kind.decode('ascii'),'offset':offset})
        offset+=size
    positions={b['type']:b['offset'] for b in boxes}
    assert positions['moov']<positions['mdat']
    return {'passed':True,'boxes':boxes}


def audio_digest(path):
    return run('ffmpeg',['-v','error','-i',path,'-map','0:a:0','-c','copy','-f','hash','-hash','sha256','-'],
               stdout=subprocess.PIPE).stdout.decode().strip()


def timestamps(path):
    data=json.loads(run('ffprobe',['-v','error','-select_streams','v:0','-show_entries',
                'frame=best_effort_timestamp_time','-of','json',path],stdout=subprocess.PIPE).stdout)
    return [float(f['best_effort_timestamp_time']) for f in data['frames']]


def summary(metadata):
    v=next(s for s in metadata['streams'] if s['codec_type']=='video')
    return {'video':{k:v[k] for k in ['codec_name','width','height','pix_fmt','avg_frame_rate','nb_frames','duration']},
            'audio':[{k:s.get(k) for k in ['codec_name','sample_rate','channels','duration']} for s in metadata['streams'] if s['codec_type']=='audio'],
            'durationSeconds':float(metadata['format']['duration']),'bytes':int(metadata['format']['size'])}


def publish():
    output=TARGET/'cell-31.mp4'
    poster=TARGET/'cell-31-poster.jpg'
    report_path=REPORTS/'cell31-report.json'
    source_hash,old_hash=sha256(SOURCE),sha256(OLD)
    script_hash=sha256(Path(__file__))
    if output.exists() or poster.exists() or report_path.exists():
        if not all(p.exists() for p in [output,poster,report_path]):
            raise ValueError('Incomplete existing repair; refusing overwrite')
        existing=json.loads(report_path.read_text(encoding='utf-8'))
        assert existing['scriptSha256']==script_hash,'Repair script changed; use a new versioned target'
        assert existing['input']['sha256']==source_hash
        assert existing['previousIntegrated']['sha256']==old_hash
        assert existing['output']['sha256']==sha256(output)
        assert existing['poster']['sha256']==sha256(poster)
        print('SKIPPED: repair, poster and untouched sources match report')
        return
    staging,sequence,repaired,tracks=render_preview()
    movie=staging/'cell-31.mp4'
    metadata=probe(SOURCE)
    assert summary(metadata)['video']['avg_frame_rate']=='24/1'
    assert len(sequence)==121 and sequence.shape[1:3]==(720,1280)
    args=['-hide_banner','-v','error','-n','-f','rawvideo','-pix_fmt','rgb24','-video_size','1280x720','-framerate','24',
          '-i','-','-i',str(SOURCE),'-map','0:v:0','-map','1:a:0','-map_metadata','-1','-map_chapters','-1',
          '-c:v','libx264','-preset','slow','-crf','18','-pix_fmt','yuv420p','-fps_mode','passthrough',
          '-video_track_timescale','90000','-c:a','copy','-movflags','+faststart+use_metadata_tags']
    provenance=metadata['format'].get('tags',{}).get('AIGC')
    if provenance:
        args+=['-metadata','AIGC='+provenance]
    args+=[str(movie)]
    process=subprocess.Popen([str(BIN/'ffmpeg.exe'),*args],stdin=subprocess.PIPE,stderr=subprocess.PIPE,
                             creationflags=CREATION_FLAGS)
    try:
        for frame in repaired:
            process.stdin.write(frame.tobytes())
        process.stdin.close()
        error=process.stderr.read().decode(errors='replace')
        if process.wait(timeout=120)!=0 or error.strip():
            raise RuntimeError('Encoding failed: '+error)
    finally:
        if process.poll() is None:
            process.kill()
    native_poster=staging/'cell-31-poster.jpg'
    run('ffmpeg',['-hide_banner','-v','error','-n','-ss','0.1','-i',movie,'-frames:v','1','-q:v','2',native_poster])
    decoded,encoded_metadata=frames(movie)
    assert len(decoded)==len(sequence)
    check=run('ffmpeg',['-hide_banner','-v','error','-xerror','-i',movie,'-map','0:v:0','-map','0:a:0','-f','null','-'],stderr=subprocess.PIPE)
    assert not check.stderr.strip()
    before_pts,after_pts=timestamps(SOURCE),timestamps(movie)
    assert before_pts==after_pts,'Original frame timestamps changed'
    original_audio,edited_audio=audio_digest(SOURCE),audio_digest(movie)
    assert original_audio==edited_audio,'Original audio packets changed'
    assert abs(summary(metadata)['durationSeconds']-summary(encoded_metadata)['durationSeconds'])<.025
    assert encoded_metadata['format'].get('tags',{}).get('AIGC')==provenance
    assert all(t['allChangesInsidePaper'] for t in tracks)
    for first in range(0,len(decoded),30):
        indices=range(first,min(first+30,len(decoded)))
        sheet=Image.new('RGB',(1550,6*232),'#eee8dd')
        for n,index in enumerate(indices):
            crop=Image.fromarray(decoded[index]).crop((510,240,820,450))
            ox,oy=(n%5)*310,(n//5)*232
            sheet.paste(crop,(ox,oy+22))
            ImageDraw.Draw(sheet).text((ox+6,oy+6),f'FRAME {index}',fill='black')
        sheet.save(staging/f'encoded-paper-{first:03d}.png')
    for index in [0,30,50,70,120]:
        Image.fromarray(decoded[index]).save(staging/f'encoded-native-{index}.png')
    report={
        'generatedAt':datetime.now(timezone.utc).isoformat(),'cell':31,'scriptSha256':script_hash,
        'authorization':'User authorized local per-frame repairs on 2026-09-13. No image or model API called.',
        'method':'121 individually edge-tracked paper planes; local reddish malformed title cleanup fitted to paper lighting; Microsoft YaHei Bold perspective-mapped title; boundary-connected fingers protected. H.264 CRF18, original AAC packets copied.',
        'replacementText':'协商方案','input':{'filename':SOURCE.name,'sha256':source_hash,**summary(metadata)},
        'previousIntegrated':{'filename':OLD.name,'sha256':old_hash},
        'output':{'url':'/cinematics/team-20260912-repaired-20260913/cell-31.mp4','sha256':sha256(movie),**summary(encoded_metadata)},
        'poster':{'url':'/cinematics/team-20260912-repaired-20260913/cell-31-poster.jpg','sha256':sha256(native_poster),'seconds':.1},
        'verification':{'fullDecode':True,'frameTimestampsIdentical':True,'originalAudioPacketsIdentical':True,
                        'audioSha256':original_audio,'allPreEncodeChangesInsidePaper':True,'edgeFallbacks':0,
                        'aigcMetadataPreserved':True,'faststart':faststart(movie)},
        'tracks':tracks,'evidenceDirectory':str(staging.relative_to(ROOT)).replace('\\','/'),
        'limitations':'Local cleanup reconstructs text-region paper pixels; final video re-encode is not lossless. Original generated paper shape and body lines remain; no legal conclusion or signed status added.',
    }
    assert sha256(SOURCE)==source_hash and sha256(OLD)==old_hash
    report['verification']['originalsUnchanged']=True
    TARGET.mkdir(parents=True,exist_ok=True)
    # Hardlink verified outputs with exclusive destination semantics. Another
    # task may publish cell 08 to this directory; never replace its directory.
    os.link(movie,output)
    os.link(native_poster,poster)
    with report_path.open('x',encoding='utf-8') as f:
        json.dump(report,f,ensure_ascii=False,indent=2)
    print(json.dumps({'passed':True,'frames':len(decoded),'output':str(output),'evidence':str(staging)},ensure_ascii=True))


def run(name, args, **kwargs):
    return subprocess.run([str(BIN / (name + '.exe')), *map(str, args)],
                          check=True, creationflags=CREATION_FLAGS, **kwargs)


def probe(path):
    return json.loads(run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path],
                          stdout=subprocess.PIPE).stdout)


def frames(path):
    metadata = probe(path)
    stream = next(s for s in metadata['streams'] if s['codec_type'] == 'video')
    data = run('ffmpeg', ['-hide_banner', '-v', 'error', '-i', path,
                         '-map', '0:v:0', '-fps_mode', 'passthrough', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
               stdout=subprocess.PIPE).stdout
    return np.frombuffer(data, dtype=np.uint8).reshape(-1, stream['height'], stream['width'], 3), metadata


def inspect():
    REPORTS.mkdir(parents=True, exist_ok=True)
    sequence, metadata = frames(SOURCE)
    print(json.dumps({'frames': len(sequence), 'format': metadata['format']['duration']}))
    for group in range(2):
        selected = list(range(group * 60, min(len(sequence), (group + 1) * 60 + 1), 10))
        sheet = Image.new('RGB', (1000, 390 * 4), '#f4f1e9')
        for i, index in enumerate(selected):
            crop = Image.fromarray(sequence[index]).crop((500, 275, 825, 480)).resize((650, 410))
            # Sparse coordinate lines are an inspection overlay, never a movie asset.
            d = ImageDraw.Draw(crop)
            for x in range(500, 825, 20):
                d.line(((x - 500) * 2, 0, (x - 500) * 2, 410), fill='#54ada5', width=1)
                d.text(((x - 500) * 2 + 2, 3), str(x), fill='#004533')
            for y in range(280, 480, 20):
                d.line((0, (y - 275) * 2, 650, (y - 275) * 2), fill='#54ada5', width=1)
                d.text((2, (y - 275) * 2 + 2), str(y), fill='#004533')
            crop = crop.resize((500, 316))
            ox, oy = (i % 2) * 500, (i // 2) * 390
            sheet.paste(crop, (ox, oy + 25))
            ImageDraw.Draw(sheet).text((ox + 10, oy + 7), f'FRAME {index} ({index / 24:.3f}s)', fill='black')
        dest = REPORTS / f'cell31-coordinate-sheet-{group}.png'
        if not dest.exists():
            sheet.save(dest)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--inspect', action='store_true')
    parser.add_argument('--inspect-tracks', action='store_true')
    parser.add_argument('--preview', action='store_true')
    parser.add_argument('--publish', action='store_true')
    args = parser.parse_args()
    if args.inspect:
        inspect()
    elif args.inspect_tracks:
        inspect_tracks()
    elif args.preview:
        render_preview()
    elif args.publish:
        publish()
    else:
        raise SystemExit('Repair requires inspected paper tracks; use --inspect first.')
