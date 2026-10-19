"""Life Archive local ASR adapter. Uses installed FunASR and cached models only."""
import argparse
import os
import re
import shutil
import subprocess
import tempfile

p = argparse.ArgumentParser()
p.add_argument('audio')
p.add_argument('--out', required=True)
p.add_argument('--cache', required=True)
a = p.parse_args()
os.environ['MODELSCOPE_CACHE'] = a.cache
os.environ['HF_HUB_OFFLINE'] = '1'
os.environ['PYTORCH_ENABLE_MPS_FALLBACK'] = '1'
models = {
    'model': os.path.join(a.cache, 'models/iic/SenseVoiceSmall'),
    'vad_model': os.path.join(a.cache, 'models/iic/speech_fsmn_vad_zh-cn-16k-common-pytorch'),
    'punc_model': os.path.join(a.cache, 'models/iic/punc_ct-transformer_zh-cn-common-vocab272727-pytorch'),
}
if not all(os.path.isdir(path) for path in models.values()):
    raise RuntimeError('Local speech models are missing; prepare the FunASR cache first.')
import torch
from funasr import AutoModel

device = 'mps' if torch.backends.mps.is_available() else 'cpu'
with tempfile.TemporaryDirectory(prefix='life-audio-') as temp:
    audio = a.audio
    if not audio.lower().endswith('.wav'):
        audio = os.path.join(temp, 'audio.wav')
        ffmpeg = shutil.which('ffmpeg')
        if ffmpeg:
            command = [ffmpeg, '-nostdin', '-y', '-i', a.audio, '-ar', '16000', '-ac', '1', audio]
        else:
            command = ['/usr/bin/afconvert', a.audio, audio, '-d', 'LEI16@16000', '-f', 'WAVE']
        subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    model = AutoModel(**models, device=device, disable_update=True, trust_remote_code=False)
    result = model.generate(input=audio)
    text = ''.join(re.sub(r'<\|[^>]+\|>', '', item.get('text', '')) for item in result).strip()
    if not text:
        raise RuntimeError('No speech was recognized. Original audio is retained.')
    # Preserve fillers, negation, names and uncertainty. No text rewriting here.
    with open(a.out, 'w', encoding='utf-8') as out:
        out.write(text)
