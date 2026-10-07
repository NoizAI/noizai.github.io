#!/usr/bin/env python3
"""Rebuild the overview from its original, with first-shot institutional logos."""
import argparse
import json
from pathlib import Path
import shutil
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
parser.add_argument('--codec', choices=('h264', 'hevc'), required=True)
parser.add_argument('--ffmpeg', default=shutil.which('ffmpeg'))
args = parser.parse_args()
if not args.ffmpeg:
    parser.error('Provide --ffmpeg or install ffmpeg on PATH')
root = Path(__file__).resolve().parents[1]
ffprobe = str(Path(args.ffmpeg).with_name('ffprobe'))

def probe(path):
    return json.loads(subprocess.check_output([
        ffprobe, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)
    ]))

def audio_packets(path):
    return subprocess.check_output([
        args.ffmpeg, '-v', 'error', '-i', str(path), '-map', '0:a:0', '-c', 'copy',
        '-f', 'data', '-'
    ])

args.output.mkdir(parents=True, exist_ok=True)
dest = args.output / 'overview.mp4'
logo_inputs = []
for name in ('UST_L4.png', 'noiz.png'):
    logo_inputs += ['-loop', '1', '-framerate', '25', '-t', '4', '-i',
                    str(root / 'assets/branding' / name)]
# Both logos fade with the opening title. Cover the obsolete submission subtitle.
graph = (
    "[0:v]fps=25,drawbox=x=430:y=432:w=420:h=64:color=white:t=fill:enable='lt(t,4)'[base];"
    '[1:v]scale=300:-1,format=rgba,fade=t=out:st=3.4:d=0.6:alpha=1[hkust];'
    '[2:v]scale=230:-1,format=rgba,fade=t=out:st=3.4:d=0.6:alpha=1[noiz];'
    "[base][hkust]overlay=x=325:y=400:eof_action=pass:enable='lt(t,4)'[branded];"
    "[branded][noiz]overlay=x=755:y=418:eof_action=pass:enable='lt(t,4)'[video]"
)
hevc = args.codec == 'hevc'
subprocess.run([
    args.ffmpeg, '-v', 'error', '-nostdin', '-y', '-i', str(args.source),
    *logo_inputs, '-filter_complex_threads', '1', '-filter_complex', graph,
    '-map', '[video]', '-map', '0:a:0',
    '-c:v', 'libx265' if hevc else 'libx264', '-preset', 'fast', '-threads', '4', '-crf', '16',
    *(['-x265-params', 'log-level=error:pools=3:frame-threads=1'] if hevc else []),
    '-pix_fmt', 'yuv420p', '-tag:v', 'hvc1' if hevc else 'avc1',
    '-c:a', 'copy', '-movflags', '+faststart', str(dest)
], check=True)
info = probe(dest)
video = next(s for s in info['streams'] if s['codec_type'] == 'video')
assert video['codec_name'] == args.codec and video['avg_frame_rate'] == '25/1'
assert (video['width'], video['height']) == (1280, 720)
assert abs(float(info['format']['duration']) - float(probe(args.source)['format']['duration'])) < .1
assert audio_packets(args.source) == audio_packets(dest)
subprocess.run([
    args.ffmpeg, '-v', 'error', '-nostdin', '-y', '-i', str(dest), '-frames:v', '1',
    '-q:v', '2', str(args.output / 'overview.jpg')
], check=True)
print(json.dumps({'path': str(dest), 'bytes': dest.stat().st_size,
                  'duration': info['format']['duration'], 'audio_unchanged': True}))
