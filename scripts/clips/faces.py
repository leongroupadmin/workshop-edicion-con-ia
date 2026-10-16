"""Face tracks + audiovisual TalkNet scores. No writes outside the clip workspace.
Dependencies and pretrained weights live in .cache/clips, never in Edit's runtime.
"""
import argparse
import json
import sys
from pathlib import Path
import cv2
import numpy as np
import torch
from scipy.io import wavfile
from python_speech_features import mfcc

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.cache' / 'clips'
sys.path.insert(0, str(CACHE / 'TalkNet'))
from model.talkNetModel import talkNetModel
from loss import lossAV


def overlap(a, b):
    x = max(a[0], b[0]); y = max(a[1], b[1])
    w = max(0, min(a[0]+a[2], b[0]+b[2])-x)
    h = max(0, min(a[1]+a[3], b[1]+b[3])-y)
    return w*h / max(1, a[2]*a[3]+b[2]*b[3]-w*h)


def networks():
    torch.set_num_threads(2)
    model, head = talkNetModel().eval(), lossAV().eval()
    state = torch.load(CACHE / 'talknet.model', map_location='cpu', weights_only=True)
    model.load_state_dict({k[len('model.'):]: v for k, v in state.items() if k.startswith('model.')})
    head.load_state_dict({k[len('lossAV.'):]: v for k, v in state.items() if k.startswith('lossAV.')})
    return model, head


def analyze(video, audio, output):
    model, head = networks()
    detector = cv2.FaceDetectorYN.create(str(CACHE / 'face.onnx'), '', (640, 360), .75, .3, 5000)
    cap = cv2.VideoCapture(video)
    tracks, previous, frames = {}, [], []
    count = 0
    previous_scene = None
    while True:
        ok, frame = cap.read()
        if not ok: break
        height, width = frame.shape[:2]
        # A real camera cut invalidates previous positions immediately.
        scene = cv2.resize(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY), (64, 36))
        shot = False
        if previous_scene is not None:
            delta = float(np.mean(cv2.absdiff(scene, previous_scene)))
            histogram = cv2.calcHist([scene], [0], None, [32], [0,256])
            old_histogram = cv2.calcHist([previous_scene], [0], None, [32], [0,256])
            shot = delta > 45 and cv2.compareHist(histogram, old_histogram, cv2.HISTCMP_CORREL) < .5
        previous_scene = scene
        if shot: previous = []
        if count % 5 == 0 or shot:
            detector.setInputSize((width, height))
            _, detected = detector.detect(frame)
            boxes = [] if detected is None else sorted([x[:4].tolist() for x in detected], key=lambda b: b[2]*b[3], reverse=True)[:8]
            current, used = [], set()
            for box in boxes:
                matches = [(overlap(box, old), tid) for tid, old in previous if tid not in used]
                best = max(matches, default=(0, -1))
                tid = best[1] if best[0] > .2 else len(tracks)
                tracks.setdefault(tid, [])
                current.append((tid, box)); used.add(tid)
            previous = current
        faces = []
        for tid, box in previous:
            x, y, w, h = box
            cx, cy, radius = x+w/2, y+h/2, max(w,h)/2
            padded = cv2.copyMakeBorder(frame, height, height, width, width, cv2.BORDER_CONSTANT)
            face = padded[int(cy-radius+height):int(cy+radius*1.8+height), int(cx-radius*1.4+width):int(cx+radius*1.4+width)]
            if face.size == 0: continue
            face = cv2.resize(cv2.cvtColor(face, cv2.COLOR_BGR2GRAY), (224,224))[56:168,56:168]
            tracks[tid].append((count, face))
            faces.append({'track': tid, 'x': x/width, 'y': y/height, 'w': w/width, 'h': h/height, 'score': -10.0})
        frames.append({'timeMs': count*40, 'faces': faces, 'shot': shot})
        count += 1
    cap.release()
    sr, sound = wavfile.read(audio)
    if sr != 16000: raise ValueError('El audio debe ser mono 16 kHz.')
    features = mfcc(sound, sr, numcep=13, winlen=.025, winstep=.010)
    features = np.pad(features, ((0,max(0,count*4-len(features))),(0,0)), mode='edge')
    for tid, sequence in tracks.items():
        # Break at missing detections; never associate faces across an unseen gap.
        groups = []
        for index, face in sequence:
            if not groups or index != groups[-1][-1][0]+1: groups.append([])
            groups[-1].append((index, face))
        for group in groups:
            if len(group) < 10: continue
            for offset in range(0, len(group), 50):
                batch = group[offset:offset+50]
                if len(batch) < 5: continue
                start = batch[0][0]
                a = torch.from_numpy(features[start*4:(start+len(batch))*4].astype(np.float32)).unsqueeze(0)
                v = torch.from_numpy(np.array([item[1] for item in batch], dtype=np.float32)).unsqueeze(0)
                with torch.inference_mode():
                    ea, ev = model.forward_audio_frontend(a), model.forward_visual_frontend(v)
                    ea, ev = model.forward_cross_attention(ea, ev)
                    scores = head(model.forward_audio_visual_backend(ea, ev))
                for (idx, _), score in zip(batch, scores):
                    for face in frames[idx]['faces']:
                        if face['track'] == tid: face['score'] = float(score)
        print(f'Rostro {tid+1}/{len(tracks)} analizado', flush=True)
    # 200 ms median reduces unstable scores while keeping real speaker changes.
    for i, frame in enumerate(frames):
        for face in frame['faces']:
            samples = [f['score'] for row in frames[max(0,i-2):i+3] for f in row['faces'] if f['track'] == face['track']]
            face['score'] = float(np.median(samples))
    Path(output).write_text(json.dumps(frames))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--video'); parser.add_argument('--audio'); parser.add_argument('--output')
    args = parser.parse_args()
    if args.check:
        networks()
        cv2.FaceDetectorYN.create(str(CACHE / 'face.onnx'), '', (640,360))
        print('Seguimiento audiovisual listo')
    else:
        analyze(args.video, args.audio, args.output)
