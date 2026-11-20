#!/usr/bin/env python3
"""Bind prepared character PNG layers to the unchanged task-064 native rig.

Only the art() implementation changes. The v1 Drawing class supplies the same
hierarchical bones, local RotationConstraints, animation keys, Clean/Rig boards,
ground and cyan overlay. No image generation, network request or Rive script.
Image vertices are in the global frame-0 canvas. Tendons contain GLOBAL REST
matrices, not inverse matrices; native Rive applies the inverse bind itself.
"""
import argparse
import base64
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import struct
import sys
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True
HERE = Path(__file__).resolve().parent
OUT = HERE / 'project'
BASE = HERE.parent


def digest(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def finite(value, label):
    v = float(value)
    if not math.isfinite(v):
        raise ValueError(label + ' must be finite')
    return v


def varuint(value):
    out = bytearray()
    while value > 127:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return out


def pack_weights(raw, tendon_names):
    if not isinstance(raw, dict):
        raise ValueError('Vertex weights must be a boneName:weight object')
    values = []
    for name, value in raw.items():
        value = finite(value, 'Weight')
        if value < 0:
            raise ValueError('Negative influence')
        if value > 0:
            if name not in tendon_names:
                raise ValueError('Unknown weighted bone: ' + name)
            values.append((name, value))
    if not 1 <= len(values) <= 4:
        raise ValueError('Each vertex requires 1..4 positive bone influences')
    total = sum(value for _, value in values)
    if not math.isfinite(total) or total <= 0:
        raise ValueError('Influence total must be finite and positive')
    normalized = [(name, value * 255 / total) for name, value in values]
    ints = [math.floor(value) for _, value in normalized]
    remainder = 255 - sum(ints)
    order = sorted(range(len(ints)), key=lambda i: (-(normalized[i][1] - ints[i]), i))
    for i in order[:remainder]:
        ints[i] += 1
    indices = weights = 0
    decoded = []
    for slot, ((name, _), value) in enumerate(zip(normalized, ints)):
        indices |= (tendon_names.index(name) + 1) << (slot * 8)
        weights |= value << (slot * 8)
        decoded.append((name, value / 255))
    assert sum(ints) == 255
    return indices, weights, decoded


def world_matrix(bone):
    angle = bone['world_rotation_rad']
    c, s = math.cos(angle), math.sin(angle)
    return {'xx': c, 'xy': s, 'yx': -s, 'yy': c,
            'tx': bone['origin'][0], 'ty': bone['origin'][1]}


def deform(vertex, influences, rest, pose):
    """CPU reference using quantized weights and pose * inverse(global rest)."""
    x = y = 0.
    for name, weight in influences:
        r, p = rest[name], pose[name]
        dx, dy = vertex['x'] - r['origin'][0], vertex['y'] - r['origin'][1]
        c, s = math.cos(r['world_rotation_rad']), math.sin(r['world_rotation_rad'])
        lx, ly = c * dx + s * dy, -s * dx + c * dy
        c, s = math.cos(p['world_rotation_rad']), math.sin(p['world_rotation_rad'])
        x += weight * (c * lx - s * ly + p['origin'][0])
        y += weight * (s * lx + c * ly + p['origin'][1])
    return [x, y]


def read_assets(path, bone_names):
    path = path.resolve(strict=True)
    if not path.is_relative_to(OUT.resolve()):
        raise ValueError('Manifest must be inside skin-v2/project')
    data = json.loads(path.read_text())
    layers = data.get('layers')
    if not isinstance(layers, list) or not layers:
        raise ValueError('skin-assets.json requires a nonempty layers array')
    names, result = set(), []
    for index, raw in enumerate(layers):
        layer = dict(raw)
        name = layer.get('name')
        if not isinstance(name, str) or not name or name in names:
            raise ValueError('Layer names must be nonempty and unique')
        names.add(name)
        image = (path.parent / layer['file']).resolve(strict=True)
        if not image.is_relative_to(OUT.resolve()) or not image.is_file():
            raise ValueError('Prepared PNG must stay inside skin-v2/project: ' + name)
        with image.open('rb') as source:
            header = source.read(24)
        if len(header) != 24 or header[:8] != b'\x89PNG\r\n\x1a\n' or header[12:16] != b'IHDR':
            raise ValueError('Prepared image must be a PNG: ' + name)
        dimensions = struct.unpack('>II', header[16:24])
        if dimensions != (layer['width'], layer['height']):
            raise ValueError('PNG dimensions disagree with manifest: ' + name)
        if not all(type(v) is int and v > 0 for v in dimensions):
            raise ValueError('Invalid PNG dimensions: ' + name)
        vertices = layer.get('vertices')
        triangles = layer.get('triangles')
        if not isinstance(vertices, list) or len(vertices) < 3 or not triangles:
            raise ValueError('Layer needs at least 3 vertices and one triangle: ' + name)
        for vertex in vertices:
            for key in ('x', 'y', 'u', 'v'):
                vertex[key] = finite(vertex[key], name + '.' + key)
            if not 0 <= vertex['u'] <= 1 or not 0 <= vertex['v'] <= 1:
                raise ValueError('UV outside normalized 0..1: ' + name)
            weights = vertex.get('weights')
            if not isinstance(weights, dict) or set(weights) - set(bone_names):
                raise ValueError('Missing/unknown bone weights: ' + name)
        for triangle in triangles:
            if len(triangle) != 3 or len(set(triangle)) != 3 or any(
                    type(i) is not int or not 0 <= i < len(vertices) for i in triangle):
                raise ValueError('Invalid triangle indices: ' + name)
        layer['_path'] = image
        layer['_relative'] = image.relative_to(OUT.resolve()).as_posix()
        layer['_sha256'] = digest(image)
        layer['_input_index'] = index
        layer['order'] = finite(layer.get('order', index), name + '.order')
        result.append(layer)
    # Later entries are explicitly drawn in front by Drawing.draw_in_front().
    return sorted(result, key=lambda layer: (layer['order'], layer['_input_index']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, default=OUT / 'skin-assets.json')
    args = parser.parse_args()
    profile_path = BASE / 'rig_profile.json'
    timeline_path = BASE / 'project' / 'timeline.json'
    base_source = BASE / 'generate_character.py'
    profile = json.loads(profile_path.read_text())
    timeline_data = json.loads(timeline_path.read_text())
    timeline = timeline_data['frames']
    if (len(profile['bones']) != 16 or timeline[0]['frame'] != 0 or
            timeline_data['fps'] != 24 or timeline_data['duration_frames'] != 360):
        raise ValueError('Expected the unchanged task-064 16-bone 15s/24fps rig')
    bone_names = [bone['name'] for bone in profile['bones']]
    layers = read_assets(args.assets, bone_names)
    spec = importlib.util.spec_from_file_location('task064_v1_drawing', base_source)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    class SkinnedDrawing(module.Drawing):
        def __init__(self):
            super().__init__(profile)
            self.asset_ids = {}
            self.layer_receipts = []
            self.rest = timeline[0]['bones']
            for layer in layers:
                asset = self.node(self.root, 'ImageAsset', layer['name']+' texture',
                                  file=layer['_relative'])
                self.asset_ids[layer['name']] = asset.get('id')

        def art(self, bones):
            board = next(board for board in self.root if board.tag == 'Artboard' and
                         any(child is bones['pelvis'] for child in board))
            is_clean = board.get('name') == 'Clean'
            for layer in layers:
                name = layer['name']
                image = self.node(board, 'Image', name,
                                  assetId=self.asset_ids[name], x=0, y=0,
                                  originX=0, originY=0, scaleX=1, scaleY=1)
                self.layers.append(image)
                tendon_names = [n for n in bone_names if any(
                    finite(v['weights'].get(n, 0), name+' weight') > 0 for v in layer['vertices'])]
                if not 1 <= len(tendon_names) <= 32:
                    raise ValueError('A mesh needs 1..32 registered tendons: ' + name)
                triangle_bytes = bytearray()
                for triangle in layer['triangles']:
                    for index in triangle:
                        triangle_bytes.extend(varuint(index))
                mesh = self.node(image, 'Mesh', name+' mesh',
                                 triangleIndexBytes=base64.b64encode(triangle_bytes).decode())
                influences = []
                for index, vertex in enumerate(layer['vertices']):
                    v = self.node(mesh, 'MeshVertex', 'Vertex '+str(index),
                                  **{key: vertex[key] for key in ('x', 'y', 'u', 'v')})
                    selectors, packed, decoded = pack_weights(vertex['weights'], tendon_names)
                    module.add(v, 'Weight', indices=selectors, values=packed)
                    influences.append(decoded)
                skin = self.node(mesh, 'Skin', name+' skin',
                                 xx=1, xy=0, yx=0, yy=1, tx=0, ty=0)
                for bone in tendon_names:
                    self.node(skin, 'Tendon', bone+' global rest bind',
                              boneId=bones[bone].get('id'), **world_matrix(self.rest[bone]))
                if is_clean:
                    maximum_rest_error = 0.
                    for vertex, decoded in zip(layer['vertices'], influences):
                        p = deform(vertex, decoded, self.rest, self.rest)
                        maximum_rest_error = max(maximum_rest_error,
                                                 math.dist(p, [vertex['x'], vertex['y']]))
                    if maximum_rest_error > 1e-6:
                        raise ValueError('Frame-0 bind identity failed: ' + name)
                    samples = []
                    for frame_index in (0, 54, 144, 240, 360):
                        sample = timeline[frame_index]
                        points = [deform(v, w, self.rest, sample['bones']) for v, w in
                                  zip(layer['vertices'], influences)]
                        samples.append({'frame': sample['frame'], 'bbox': [
                            min(p[0] for p in points), min(p[1] for p in points),
                            max(p[0] for p in points), max(p[1] for p in points)]})
                    self.layer_receipts.append({
                        'name': name, 'file': layer['_relative'], 'order': layer['order'],
                        'image_sha256': layer['_sha256'], 'image_size': [layer['width'], layer['height']],
                        'vertices': len(layer['vertices']), 'triangles': len(layer['triangles']),
                        'tendons': tendon_names, 'max_influences': max(map(len, influences)),
                        'max_frame0_bind_error_px': maximum_rest_error,
                        'cpu_quantized_weight_pose_samples': samples,
                    })

    drawing = SkinnedDrawing()
    drawing.artboard('Clean', timeline)
    drawing.artboard('Rig', timeline, True, 1000)
    OUT.mkdir(parents=True, exist_ok=True)
    ET.indent(drawing.root, space='  ')
    xml = '<?xml version="1.0" encoding="utf-8"?>\n'+ET.tostring(drawing.root, encoding='unicode')+'\n'
    (OUT / 'scene.rml').write_text(xml)
    (OUT / 'rive.yaml').write_text(
        'name: bjj-designed-character-native-skin\nmain: Clean\noutput:\n  dir: build\n')
    receipt = {
        'schema_version': 1, 'status': 'source_generated',
        'representation': 'original_design_png_native_weighted_mesh_on_hierarchical_rig',
        'artboards': ['Clean', 'Rig'], 'size': [900, 900], 'fps': 24, 'duration_frames': 360,
        'bones_per_artboard': 16, 'native_rotation_constraints_per_artboard': 16,
        'rig_motion_and_limits_changed': False, 'animated_properties': ['rotation', 'pelvis.x', 'pelvis.y'],
        'source_hashes': {'drawing': digest(base_source), 'profile': digest(profile_path),
                          'timeline': digest(timeline_path), 'skin_assets': digest(args.assets)},
        'skin_transform': 'identity; Image is artboard child with identity transform and origin 0,0',
        'tendon_transform': 'global frame-0 REST; runtime applies inverse bind',
        'global_rest_matrices': {name: world_matrix(timeline[0]['bones'][name]) for name in bone_names},
        'layer_order': 'ascending order: back to front; stable input order for ties; native before chain',
        'layers': drawing.layer_receipts, 'scene_sha256': hashlib.sha256(xml.encode()).hexdigest(),
        'paid_api_calls': 0, 'image_upload': False, 'native_runtime_verified': False,
        'visual_verified': False, 'user_quality': 'pending',
    }
    (OUT / 'skin-build-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps({'status': receipt['status'], 'project': str(OUT), 'layers': len(layers),
                      'scene_sha256': receipt['scene_sha256'], 'native_runtime_verified': False}, indent=2))


if __name__ == '__main__':
    main()
