#!/usr/bin/env python3
"""Serialize task-063 global 2D mesh/pose JSON to native script-free Rive RML.

All image/mesh coordinates use the input's global rest canvas. Images have unit
transforms, Skin is identity, and Tendons hold absolute bone REST transforms
(not pre-inverted matrices). The Rive runtime inverts those bind transforms.
"""
import argparse
import base64
import hashlib
import json
import math
import os
from pathlib import Path
import xml.etree.ElementTree as ET


def number(value, label):
    n = float(value)
    if not math.isfinite(n):
        raise ValueError(label + ' must be finite')
    return n


def element(parent, kind, **attrs):
    return ET.SubElement(parent, kind, {k: str(v) for k, v in attrs.items()})


def varuint(value):
    if value < 0:
        raise ValueError('Negative triangle index')
    out = bytearray()
    while value > 127:
        out.append((value & 127) | 128)
        value >>= 7
    out.append(value)
    return out


def packed_weights(raw, tendon_names):
    if not isinstance(raw, dict):
        raise ValueError('Each vertex needs a boneName:weight dictionary')
    values = []
    for name, raw_weight in raw.items():
        if name not in tendon_names:
            raise ValueError('Weight references unknown bone ' + name)
        weight = number(raw_weight, 'Weight for ' + name)
        if weight < 0:
            raise ValueError('Negative weight for ' + name)
        if weight > 0:
            values.append((name, weight))
    if not values or len(values) > 4:
        raise ValueError('A vertex must have 1..4 positive bone influences')
    total = sum(w for _, w in values)
    normalized = [(name, w * 255 / total) for name, w in values]
    ints = [math.floor(w) for _, w in normalized]
    order = sorted(range(len(ints)), key=lambda i: (-(normalized[i][1] - ints[i]), i))
    for i in order[:255 - sum(ints)]:
        ints[i] += 1
    assert sum(ints) == 255
    indices, packed = 0, 0
    decoded = []
    for slot, ((name, _), weight) in enumerate(zip(normalized, ints)):
        selector = tendon_names.index(name) + 1
        indices |= selector << (slot * 8)
        packed |= weight << (slot * 8)
        decoded.append({'bone': name, 'weight': weight / 255})
    return indices, packed, decoded


def matrix(bone):
    angle = bone['rotation']
    c, s = math.cos(angle), math.sin(angle)
    return {'xx': c, 'xy': s, 'yx': -s, 'yy': c,
            'tx': bone['x'], 'ty': bone['y']}


def deform(vertex, influences, rest, pose):
    """Independent CPU reference: sum(w * pose * inverse(rest) * vertex)."""
    x = y = 0.
    for influence in influences:
        name, w = influence['bone'], influence['weight']
        a, b = rest[name], pose[name]
        c, s = math.cos(a['rotation']), math.sin(a['rotation'])
        dx, dy = vertex['x'] - a['x'], vertex['y'] - a['y']
        lx, ly = c * dx + s * dy, -s * dx + c * dy
        c, s = math.cos(b['rotation']), math.sin(b['rotation'])
        x += (c * lx - s * ly + b['x']) * w
        y += (s * lx + c * ly + b['y']) * w
    return [x, y]


class Writer:
    def __init__(self, data, input_dir, output_dir, check_assets=True):
        self.data, self.input_dir, self.output_dir = data, input_dir, output_dir
        self.root = ET.Element('Rive', {'version': '1', 'kind': 'fragment'})
        self.counter = 1
        self.rest, self.bone_ids = {}, {}
        self.layers_receipt = []
        self.check_assets = check_assets
        self.width = number(data['width'], 'width')
        self.height = number(data['height'], 'height')
        self.fps = int(data['fps'])
        self.duration = int(data['duration_frames'])
        if self.width <= 0 or self.height <= 0 or self.fps <= 0 or self.duration <= 0:
            raise ValueError('Positive stage size, fps and duration are required')
        bones = data['bones']
        if not 1 <= len(bones) <= 32:
            raise ValueError('Input contract allows 1..32 bones')
        for bone in bones:
            name = bone['name']
            if not name or name in self.rest:
                raise ValueError('Bone names must be nonempty and unique')
            self.rest[name] = {k: number(bone.get(k, 0), name + '.' + k)
                               for k in ('x', 'y', 'rotation', 'length')}
            if self.rest[name]['length'] < 0:
                raise ValueError('Negative bone length')
        self.frames = self.read_frames()

    def ident(self):
        ident = '0:' + str(self.counter)
        self.counter += 1
        return ident

    def read_frames(self):
        result = []
        previous = {name: dict(value) for name, value in self.rest.items()}
        for index, item in enumerate(self.data['frames']):
            frame = int(item.get('frame', index))
            if frame < 0 or frame > self.duration or (result and frame <= result[-1][0]):
                raise ValueError('Frame indices must increase within the animation duration')
            pose = {name: dict(value) for name, value in previous.items()}
            for name, value in item['bones'].items():
                if name not in pose:
                    raise ValueError('Frame references unknown bone ' + name)
                for key in ('x', 'y', 'rotation'):
                    if key in value:
                        pose[name][key] = number(value[key], name + '.' + key)
            result.append((frame, pose))
            previous = pose
        if not result or result[0][0] != 0:
            raise ValueError('Frames must include frame 0')
        return result

    def image_mesh(self, board, layer):
        name = layer['name']
        file = Path(layer['file'])
        if not file.is_absolute():
            file = self.input_dir / file
        file = file.resolve()
        if self.check_assets and (not file.is_file() or file.stat().st_size == 0):
            raise ValueError('Image file missing/empty: ' + str(file))
        relative = Path(os.path.relpath(file, self.output_dir)).as_posix()
        asset_id = self.ident()
        element(self.root, 'ImageAsset', file=relative, name=name + '-texture', id=asset_id)
        image = element(board, 'Image', name=name, id=self.ident(), assetId=asset_id,
                        x=0, y=0, originX=0, originY=0, scaleX=1, scaleY=1)
        vertices, triangles = layer['vertices'], layer['triangles']
        if len(vertices) < 3 or not triangles:
            raise ValueError('Mesh needs vertices and triangles: ' + name)
        tendon_names = [bone for bone in self.rest if any(
            number(v['weights'].get(bone, 0), 'weight') > 0 for v in vertices)]
        if not tendon_names:
            raise ValueError('No influenced bones: ' + name)
        index_bytes = bytearray()
        for tri in triangles:
            if len(tri) != 3 or len(set(tri)) != 3:
                raise ValueError('Triangle must have three different indices: ' + name)
            for index in tri:
                if not isinstance(index, int) or not 0 <= index < len(vertices):
                    raise ValueError('Triangle vertex out of range: ' + name)
                index_bytes.extend(varuint(index))
        mesh = element(image, 'Mesh', name=name + '-weighted-mesh', id=self.ident(),
                       triangleIndexBytes=base64.b64encode(index_bytes).decode())
        contour_count = int(layer.get('contour_count', 0))
        decoded = []
        for index, vertex in enumerate(vertices):
            values = {k: number(vertex[k], name + '.vertex.' + k) for k in ('x', 'y', 'u', 'v')}
            if not (0 <= values['u'] <= 1 and 0 <= values['v'] <= 1):
                raise ValueError('UV outside 0..1: ' + name)
            kind = 'ContourMeshVertex' if index < contour_count else 'MeshVertex'
            v = element(mesh, kind, name='v' + str(index), id=self.ident(), **values)
            indices, weights, influences = packed_weights(vertex['weights'], tendon_names)
            element(v, 'Weight', indices=indices, values=weights)
            decoded.append(influences)
        skin = element(mesh, 'Skin', name=name + '-skin', id=self.ident(),
                       xx=1, xy=0, yx=0, yy=1, tx=0, ty=0)
        for bone in tendon_names:
            element(skin, 'Tendon', name=bone + '-rest-bind', id=self.ident(),
                    boneId=self.bone_ids[bone], **matrix(self.rest[bone]))
        samples = []
        for index in sorted({0, len(vertices) // 2, len(vertices) - 1}):
            vertex = vertices[index]
            samples.append({'vertex': index, 'rest': [vertex['x'], vertex['y']],
                            'frame0_cpu': deform(vertex, decoded[index], self.rest, self.frames[0][1]),
                            'last_frame_cpu': deform(vertex, decoded[index], self.rest, self.frames[-1][1])})
        self.layers_receipt.append({'name': name, 'file': relative, 'vertices': len(vertices),
                                    'triangles': len(triangles), 'tendons': tendon_names,
                                    'max_influences': max(map(len, decoded)),
                                    'image_sha256': hashlib.sha256(file.read_bytes()).hexdigest() if file.is_file() else None,
                                    'cpu_reference_samples': samples})

    def write(self):
        board_id, style_id, state_id, animation_id = [self.ident() for _ in range(4)]
        board = element(self.root, 'Artboard', name='Clean', id=board_id, width=self.width,
                        height=self.height, styleId=style_id, defaultStateMachineId=state_id)
        element(board, 'LayoutComponentStyle', name='Canvas style', id=style_id)
        for name, bone in self.rest.items():
            ident = self.ident()
            self.bone_ids[name] = ident
            element(board, 'RootBone', name=name, id=ident, **bone)
        # Native Rive siblings are front-to-back: preserve the caller's array order.
        for layer in self.data['layers']:
            self.image_mesh(board, layer)
        background = self.data.get('background', 'FF15171E')
        fill = element(board, 'Fill', name='Stage background')
        element(fill, 'SolidColor', name='Stage color', colorValue=background)
        animation = element(board, 'LinearAnimation', name='Reference motion', id=animation_id,
                            fps=self.fps, duration=self.duration, loopValue='oneShot')
        maximum_rotation_delta = 0
        for name, ident in self.bone_ids.items():
            keyed = element(animation, 'KeyedObject', objectId=ident)
            for prop in ('x', 'y', 'rotation'):
                target = element(keyed, 'KeyedProperty', property=prop)
                previous = None
                for frame, pose in self.frames:
                    value = pose[name][prop]
                    if prop == 'rotation' and previous is not None:
                        while value - previous > math.pi:
                            value -= 2 * math.pi
                        while value - previous < -math.pi:
                            value += 2 * math.pi
                        maximum_rotation_delta = max(maximum_rotation_delta, abs(value - previous))
                    element(target, 'KeyFrameDouble', frame=frame, value=round(value, 8), interpolationType='linear')
                    previous = value
        machine = element(board, 'StateMachine', name='Reference motion', id=state_id)
        layer = element(machine, 'StateMachineLayer', name='Motion', id=self.ident())
        state = element(layer, 'AnimationState', id=self.ident(), animationId=animation_id,
                        stateName='Motion', x=240, y=0)
        entry = element(layer, 'EntryState', id=self.ident(), x=0, y=0)
        element(entry, 'StateTransition', stateToId=state.get('id'))
        element(layer, 'AnyState', id=self.ident(), x=0, y=-150)
        element(layer, 'ExitState', id=self.ident(), x=480, y=-150)
        self.output_dir.mkdir(parents=True, exist_ok=True)
        ET.indent(self.root, space='  ')
        xml = '<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(self.root, encoding='unicode') + '\n'
        rml = self.output_dir / 'scene.rml'
        rml.write_text(xml)
        (self.output_dir / 'rive.yaml').write_text(
            'name: bjj-tripod-weighted-motion\nmain: Clean\noutput:\n  dir: build\n'
            'exclude:\n  - receipt.json\n')
        receipt = {'schema_version': 1, 'representation': 'native_rive_weighted_image_mesh',
                   'size': [self.width, self.height], 'fps': self.fps, 'duration_frames': self.duration,
                   'frame_samples': len(self.frames), 'bones': len(self.rest), 'layers': self.layers_receipt,
                   'layer_order': 'input array is front-to-back', 'skin_matrix': 'identity',
                   'tendon_matrix': 'absolute REST transform; not inverse bind matrix',
                   'bone_rest_matrices': {name: matrix(bone) for name, bone in self.rest.items()},
                   'max_adjacent_sample_rotation_delta_rad': maximum_rotation_delta,
                   'native_runtime_verified': False, 'visual_verified': False,
                   'scene_sha256': hashlib.sha256(xml.encode()).hexdigest()}
        (self.output_dir / 'receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + '\n')
        return receipt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    parser.add_argument('--no-check-assets', action='store_true')
    args = parser.parse_args()
    source = args.input.expanduser().resolve()
    data = json.loads(source.read_text())
    writer = Writer(data, source.parent, args.output_dir.expanduser().resolve(), not args.no_check_assets)
    receipt = writer.write()
    print(json.dumps({'output_dir': str(writer.output_dir), 'bones': receipt['bones'],
                      'layers': len(receipt['layers']), 'frames': receipt['frame_samples'],
                      'scene_sha256': receipt['scene_sha256'],
                      'max_rotation_delta_rad': receipt['max_adjacent_sample_rotation_delta_rad']}, indent=2))


if __name__ == '__main__':
    main()
