#!/usr/bin/env python3
"""Pinned source + HTTP Range safetensors HEADER audit; never reads weight data.

No MLX import, package install, model loading, inference, credentials or image
upload. Shape expectations are manually transcribed from the pinned source.
"""
import argparse
import concurrent.futures
import hashlib
import json
import math
from pathlib import Path
import struct
import urllib.parse
import urllib.request

CODE_REPO = 'Blaizzy/mlx-video'
CODE_SHA = '87db56a51758fefb748a359b90a5283bb8ba4837'
MODEL_REPO = 'SceneWorks/wan2.2-ti2v-5b-mlx'
MODEL_SHA = 'bb1b055249614cf9d7cf4373fbdbc184b77dee88'
MODEL_BASE = f'https://huggingface.co/{MODEL_REPO}/resolve/{MODEL_SHA}/q4/'
SOURCE_FILES = ['pyproject.toml'] + ['mlx_video/models/wan_2/' + name for name in
    ('config.py', 'utils.py', 'wan_2.py', 'transformer.py', 'attention.py',
     'text_encoder.py', 'vae22.py', 'generate.py', 'convert.py', 'README.md')]
FLOATS = ('BF16', 'F16', 'F32')


def fetch(url, maximum=2_000_000):
    req = urllib.request.Request(url, headers={'User-Agent': 'task063-header-only-audit'})
    with urllib.request.urlopen(req, timeout=40) as r:
        data = r.read(maximum + 1)
    if len(data) > maximum:
        raise ValueError('Text response exceeded bounded read limit: ' + url)
    return data


def span(url, start, end):
    url += '?compat_header_range=' + str(start) + '-' + str(end)
    req = urllib.request.Request(url, headers={
        'Range': f'bytes={start}-{end}', 'User-Agent': 'task063-header-only-audit'})
    with urllib.request.urlopen(req, timeout=40) as r:
        # Do not consume a server response that ignores Range.
        if r.status != 206:
            raise RuntimeError('Server ignored Range; body not read: ' + str(r.status))
        content_range = r.headers.get('Content-Range', '')
        if not content_range.startswith(f'bytes {start}-{end}/'):
            raise RuntimeError('Unexpected Content-Range: ' + content_range)
        data = r.read(end - start + 1)
        if len(data) != end - start + 1:
            raise RuntimeError('Truncated header range')
        return data, {'range': content_range, 'status': r.status,
                      'received_bytes': len(data),
                      'final_host': urllib.parse.urlparse(r.url).hostname}


def read_header(name):
    first, first_response = span(MODEL_BASE + name, 0, 7)
    length = struct.unpack('<Q', first)[0]
    if not 2 <= length <= 4_000_000:
        raise RuntimeError('Refusing unexpected safetensors JSON header length')
    raw, second_response = span(MODEL_BASE + name, 8, length + 7)
    header = json.loads(raw)
    tensors = {k: v for k, v in header.items() if k != '__metadata__'}
    return name, raw, tensors, {
        'tensor_count': len(tensors), 'header_bytes': length,
        'total_file_bytes': int(first_response['range'].split('/')[-1]),
        'responses': [first_response, second_response],
        'header_sha256': hashlib.sha256(raw).hexdigest(),
        'tensor_payload_bytes': sum(t['data_offsets'][1] - t['data_offsets'][0] for t in tensors.values()),
        'dtypes': {dtype: sum(t['dtype'] == dtype for t in tensors.values())
                   for dtype in sorted({t['dtype'] for t in tensors.values()})},
    }


def expected_transformer(c):
    e = {}
    dim, ffn = c['dim'], c['ffn_dim']
    group, bits = c['quantization']['group_size'], c['quantization']['bits']
    def linear(name, inp, out, quantized=False):
        e[name + '.bias'] = (FLOATS, [out])
        if quantized:
            e[name + '.weight'] = (('U32',), [out, inp // (32 // bits)])
            for suffix in ('scales', 'biases'):
                e[name + '.' + suffix] = (FLOATS, [out, inp // group])
        else:
            e[name + '.weight'] = (FLOATS, [out, inp])
    linear('patch_embedding_proj', c['in_dim'] * math.prod(c['patch_size']), dim)
    linear('text_embedding_0', c['text_dim'], dim)
    linear('text_embedding_1', dim, dim)
    linear('time_embedding_0', c['freq_dim'], dim)
    linear('time_embedding_1', dim, dim)
    linear('time_projection', dim, 6 * dim)
    linear('head.head', dim, c['out_dim'] * math.prod(c['patch_size']))
    e['head.modulation'] = (FLOATS, [1, 2, dim])
    for i in range(c['num_layers']):
        prefix = f'blocks.{i}.'
        for attention in ('self_attn', 'cross_attn'):
            for projection in ('q', 'k', 'v', 'o'):
                linear(prefix + attention + '.' + projection, dim, dim, True)
            if c['qk_norm']:
                for norm in ('norm_q', 'norm_k'):
                    e[prefix + attention + '.' + norm + '.weight'] = (FLOATS, [dim])
        if c['cross_attn_norm']:
            for suffix in ('weight', 'bias'):
                e[prefix + 'norm3.' + suffix] = (FLOATS, [dim])
        linear(prefix + 'ffn.fc1', dim, ffn, True)
        linear(prefix + 'ffn.fc2', ffn, dim, True)
        e[prefix + 'modulation'] = (FLOATS, [1, 6, dim])
    return e


def expected_t5(c):
    e = {'token_embedding.weight': (('BF16',), [c['t5_vocab_size'], c['t5_dim']]),
         'norm.weight': (('BF16',), [c['t5_dim']])}
    d, attn, ffn = c['t5_dim'], c['t5_dim_attn'], c['t5_dim_ffn']
    for i in range(c['t5_num_layers']):
        p = f'blocks.{i}.'
        for norm in ('norm1', 'norm2'):
            e[p + norm + '.weight'] = (('BF16',), [d])
        for proj in ('q', 'k', 'v'):
            e[p + 'attn.' + proj + '.weight'] = (('BF16',), [attn, d])
        e[p + 'attn.o.weight'] = (('BF16',), [d, attn])
        for proj in ('gate_proj', 'fc1'):
            e[p + 'ffn.' + proj + '.weight'] = (('BF16',), [ffn, d])
        e[p + 'ffn.fc2.weight'] = (('BF16',), [d, ffn])
        e[p + 'pos_embedding.embedding.weight'] = (('BF16',), [c['t5_num_buckets'], c['t5_num_heads']])
    return e


def expected_vae():
    e = {}
    def shape(name, value):
        e[name] = (('F32',), list(value))
    def conv(p, inp, out, kernel=(3, 3, 3)):
        shape(p + '.weight', (out, *kernel, inp))
        shape(p + '.bias', (out,))
    def residual(p, inp, out):
        shape(p + '.residual.layer_0.gamma', (inp,))
        conv(p + '.residual.layer_2', inp, out)
        shape(p + '.residual.layer_3.gamma', (out,))
        conv(p + '.residual.layer_6', out, out)
        if inp != out:
            conv(p + '.shortcut', inp, out, (1, 1, 1))
    def attention(p, d):
        shape(p + '.norm.gamma', (d,))
        shape(p + '.to_qkv_weight', (3 * d, 1, 1, d))
        shape(p + '.to_qkv_bias', (3 * d,))
        shape(p + '.proj_weight', (d, 1, 1, d))
        shape(p + '.proj_bias', (d,))
    def resample(p, d, mode):
        shape(p + '.resample_weight', (d, 3, 3, d))
        shape(p + '.resample_bias', (d,))
        if mode == 'up3':
            conv(p + '.time_conv', d, 2 * d, (3, 1, 1))
        elif mode == 'down3':
            conv(p + '.time_conv', d, d, (3, 1, 1))
    def middle(p, d):
        residual(p + '.0', d, d)
        attention(p + '.1', d)
        residual(p + '.2', d, d)
    def head(p, inp, out):
        shape(p + '.layer_0.gamma', (inp,))
        conv(p + '.layer_2', inp, out)
    conv('conv1', 96, 96, (1, 1, 1))
    conv('conv2', 48, 48, (1, 1, 1))
    conv('encoder.conv1', 12, 160)
    dims = [160, 160, 320, 640, 640]
    for i, (inp, out) in enumerate(zip(dims, dims[1:])):
        p = f'encoder.downsamples.{i}.downsamples'
        residual(p + '.0', inp, out)
        residual(p + '.1', out, out)
        if i < 3:
            resample(p + '.2', out, 'down2' if i == 0 else 'down3')
    middle('encoder.middle', 640)
    head('encoder.head', 640, 96)
    conv('decoder.conv1', 48, 1024)
    middle('decoder.middle', 1024)
    dims = [1024, 1024, 1024, 512, 256]
    for i, (inp, out) in enumerate(zip(dims, dims[1:])):
        p = f'decoder.upsamples.{i}.upsamples'
        residual(p + '.0', inp, out)
        residual(p + '.1', out, out)
        residual(p + '.2', out, out)
        if i < 3:
            resample(p + '.3', out, 'up3' if i < 2 else 'up2')
    head('decoder.head', 256, 12)
    return e


def compare(actual, expected):
    missing, unexpected = sorted(expected.keys() - actual.keys()), sorted(actual.keys() - expected.keys())
    wrong = []
    for key in expected.keys() & actual.keys():
        dtypes, shape = expected[key]
        if actual[key]['shape'] != shape or actual[key]['dtype'] not in dtypes:
            wrong.append({'key': key, 'actual': actual[key], 'expected_shape': shape,
                          'expected_dtypes': dtypes})
    return {'pass': not (missing or unexpected or wrong), 'expected_tensors': len(expected),
            'actual_tensors': len(actual), 'missing': missing, 'unexpected': unexpected,
            'shape_or_dtype_mismatches': wrong}


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('--output-dir', type=Path, required=True)
    args = p.parse_args()
    out = args.output_dir.expanduser().resolve()
    if 'task-063' not in out.parts or out.name != 'compatibility':
        raise ValueError('Output must be the authorized task-063/.../compatibility directory')
    out.mkdir(parents=True, exist_ok=True)
    sources = []
    def code(path):
        url = f'https://raw.githubusercontent.com/{CODE_REPO}/{CODE_SHA}/{path}'
        raw = fetch(url)
        destination = out / 'code' / path
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(raw)
        return {'path': path, 'url': url, 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        sources = list(pool.map(code, SOURCE_FILES))
    config_raw = fetch(MODEL_BASE + 'config.json', 100_000)
    (out / 'config.json').write_bytes(config_raw)
    config = json.loads(config_raw)
    tree_url = f'https://huggingface.co/api/models/{MODEL_REPO}/tree/{MODEL_SHA}/q4?expand=false'
    tree = json.loads(fetch(tree_url, 100_000))
    (out / 'q4-tree.json').write_text(json.dumps(tree, indent=2) + '\n')
    headers, metadata = {}, {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for name, raw, header, meta in pool.map(read_header, ('model.safetensors', 't5_encoder.safetensors', 'vae.safetensors')):
            (out / (name + '.header.json')).write_bytes(raw)
            headers[name], metadata[name] = header, meta
    expected = {'model.safetensors': expected_transformer(config),
                't5_encoder.safetensors': expected_t5(config), 'vae.safetensors': expected_vae()}
    comparisons = {name: compare(headers[name], shape) for name, shape in expected.items()}
    t5_bytes = metadata['t5_encoder.safetensors']['tensor_payload_bytes']
    result = {
        'code_repo': CODE_REPO, 'code_commit': CODE_SHA,
        'model_repo': MODEL_REPO, 'model_commit': MODEL_SHA, 'model_subfolder': 'q4',
        'sources': sources, 'files': metadata, 'comparisons': comparisons,
        'q4_total_file_bytes': sum(f.get('size', 0) for f in tree if f.get('type') == 'file'),
        'safetensors_header_bytes_received': sum(sum(r['received_bytes'] for r in m['responses']) for m in metadata.values()),
        'weight_payload_bytes_read': 0, 'full_weight_download': False,
        'conclusion': 'headers_structurally_compatible' if all(c['pass'] for c in comparisons.values()) else 'header_mismatch',
        'key_conversion_required': [] if all(c['pass'] for c in comparisons.values()) else 'see comparisons',
        'runtime_load_test': 'not_performed', 'quantized_payload_packing_values': 'not_sampled_or_verified',
        'memory': {'t5_bf16_tensor_bytes': t5_bytes, 'default_loader_t5_fp32_tensor_bytes': t5_bytes * 2,
                   'physical_24GiB_bytes': 24 * 1024**3,
                   'default_fp32_t5_remaining_before_OS_or_activations': 24 * 1024**3 - t5_bytes * 2,
                   'default_t5_float32_upcast': 'utils.py:85',
                   'lifecycle': ['T5 load/encode/delete+clear at generate.py:327-353',
                                 'image VAE encoder load/delete+clear at generate.py:429-438',
                                 'DiT load at generate.py:464; delete+clear at 701-718',
                                 'VAE decoder load at generate.py:724'],
                   'bf16_wrapper': 'Candidate: preserve incoming BF16 in isolated T5 loader; not implemented/tested here',
                   'bf16_attention_safety_evidence': 'text_encoder.py:116-133 explicitly computes QK, bias, mask and softmax in FP32, casts back to q.dtype',
                   'bf16_quality_and_nan_status': 'not_runtime_verified',
                   'device_memory_limit_override': 'not_proposed_or_performed'},
        'tokenizer': 'generate.py:336 downloads/caches google/umt5-xxl tokenizer; bundled tokenizer.json is not read by stock CLI',
        'installation_or_inference': 'not_performed', 'photo_upload': False,
    }
    (out / 'report.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: result[k] for k in ('conclusion', 'code_commit', 'model_commit', 'q4_total_file_bytes',
                       'safetensors_header_bytes_received', 'weight_payload_bytes_read', 'comparisons', 'memory')},
                     ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
