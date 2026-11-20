#!/usr/bin/env python3
"""Build native, script-free Rive RML for the task-062 2D cutout study.

PNG preparation belongs to the parent session. This generator reads its manifest,
preserves the original uniform scale and writes only scene.rml and rive.yaml.
The RML types/properties were checked against the installed Rive CLI 1.9.2.
"""
import argparse
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
FPS, DURATION, SCALE = 24, 288, .9
PARTS = ('head', 'torso', 'upper_arm_l', 'forearm_l', 'hand_l',
         'upper_arm_r', 'forearm_r', 'hand_r', 'thigh_l', 'shin_l',
         'foot_l', 'thigh_r', 'shin_r', 'foot_r')
IK_BRANCH = {
    ('blue', 'arm', 'l'): 1, ('blue', 'arm', 'r'): -1,
    ('blue', 'leg', 'l'): 1, ('blue', 'leg', 'r'): -1,
    ('white', 'arm', 'l'): 1, ('white', 'arm', 'r'): -1,
    ('white', 'leg', 'l'): -1, ('white', 'leg', 'r'): 1,
}


def add(parent, kind, **attrs):
    return ET.SubElement(parent, kind, {k: str(v) for k, v in attrs.items()})


def smooth(start, end, value):
    t = min(1., max(0., (value - start) / (end - start)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)


def plus(a, b):
    return (a[0] + b[0], a[1] + b[1])


def minus(a, b):
    return (a[0] - b[0], a[1] - b[1])


def rotate(p, angle):
    c, s = math.cos(angle), math.sin(angle)
    return (p[0] * c - p[1] * s, p[0] * s + p[1] * c)


def angle_of(a, b):
    d = minus(b, a)
    return math.atan2(d[1], d[0])


def distance(a, b):
    return math.hypot(b[0] - a[0], b[1] - a[1])


def polar_arc(start, end, t):
    """Interpolate a hip-relative target without crossing the hip origin."""
    a, b = math.atan2(start[1], start[0]), math.atan2(end[1], end[0])
    while b - a > math.pi:
        b -= 2 * math.pi
    while b - a < -math.pi:
        b += 2 * math.pi
    radius = math.hypot(*start) + (math.hypot(*end) - math.hypot(*start)) * t
    angle = a + (b - a) * t
    return (radius * math.cos(angle), radius * math.sin(angle))


def ik(start, end, upper, lower, pole, branch):
    """Exact two-link solve, with a fixed limb-specific geometric branch.

    Choosing whichever solution is nearer a pole on each frame causes sudden
    knee/elbow flips when the pole crosses the hip-to-ankle line. Branch +1/-1
    keeps the signed area of the limb triangle on one side throughout motion.
    """
    dx, dy = minus(end, start)
    length = math.hypot(dx, dy)
    reach_error = max(0., length - upper - lower)
    d = min(max(length, abs(upper - lower) + .0001), upper + lower - .0001)
    ux, uy = dx / max(length, .0001), dy / max(length, .0001)
    along = (upper * upper - lower * lower + d * d) / (2 * d)
    height = math.sqrt(max(0., upper * upper - along * along))
    midpoint = (start[0] + ux * along, start[1] + uy * along)
    candidates = ((midpoint[0] - uy * height, midpoint[1] + ux * height),
                  (midpoint[0] + uy * height, midpoint[1] - ux * height))
    joint = candidates[0 if branch > 0 else 1]
    return joint, reach_error


def manifest_parts(path):
    data = json.loads(path.read_text())
    raw = data.get('parts', data.get('assets', data))
    records = list(raw.items()) if isinstance(raw, dict) else [(None, x) for x in raw]
    result = {}
    for key, record in records:
        if not isinstance(record, dict):
            continue
        source = record.get('file', record.get('path', record.get('asset', key or '')))
        name = Path(str(source)).stem.replace('_', '-', 1) if source else str(key)
        # Only the color/name separator is a hyphen; part words keep underscores.
        for color in ('blue', 'white'):
            for part in PARTS:
                expected = color + '-' + part
                if Path(str(source)).stem == expected or key in (expected, color + '_' + part):
                    name = expected
        if name not in {c + '-' + p for c in ('blue', 'white') for p in PARTS}:
            continue
        pivot = record.get('pivot')
        if isinstance(pivot, dict):
            pivot = [pivot['x'], pivot['y']]
        if not pivot or len(pivot) != 2:
            raise ValueError('Missing PNG pivot for ' + name)
        length = float(record.get('source_length', record.get('length', 0)))
        if length <= 0:
            raise ValueError('Missing positive source_length for ' + name)
        result[name] = {'file': 'assets/' + name + '.png', 'pivot': pivot,
                        'source_length': length, 'source_sha256': record.get('source_sha256'),
                        'source_joint_proximal': record.get('source_joint_proximal')}
    missing = sorted({c + '-' + p for c in ('blue', 'white') for p in PARTS} - result.keys())
    if missing:
        raise ValueError('Manifest lacks parts: ' + ', '.join(missing))
    return result


class Project:
    def __init__(self, parts):
        self.parts, self.next_id = parts, 1
        self.root = ET.Element('Rive', {'version': '1', 'kind': 'fragment'})
        self.assets = {}
        for key, record in parts.items():
            ident = self.ident()
            self.assets[key] = ident
            add(self.root, 'ImageAsset', file=record['file'], name=key, id=ident)
        self.pose_report = []
        self.max_adjacent_rotation_delta = 0.
        self.large_rotation_steps = []

    def ident(self):
        value = '0:' + str(self.next_id)
        self.next_id += 1
        return value

    def length(self, color, part):
        return self.parts[color + '-' + part]['source_length'] * SCALE

    def source_offset(self, color, part):
        root = self.parts[color + '-torso']['source_joint_proximal']
        joint = self.parts[color + '-' + part]['source_joint_proximal']
        delta = minus(joint, root)
        x, y = rotate(delta, math.pi / 2)
        return (x * SCALE, y * SCALE)

    def node(self, parent, kind, name, **attrs):
        return add(parent, kind, name=name, id=self.ident(), **attrs)

    def image(self, bone, color, part, rig=False):
        name, record = color + '-' + part, self.parts[color + '-' + part]
        px, py = record['pivot']
        return self.node(bone, 'Image', name + '-art', assetId=self.assets[name],
                         originX=0, originY=0, x=-px * SCALE, y=-py * SCALE,
                         scaleX=SCALE, scaleY=SCALE, opacity=.72 if rig else 1)

    def draw_rule(self, drawable, target, placement='before'):
        rule_id, target_id = self.ident(), self.ident()
        rule = add(drawable, 'DrawRules', name='Explicit cutout layer', id=rule_id, drawTargetId=target_id)
        add(rule, 'DrawTarget', name='Layer anchor', id=target_id,
            drawableId=target, placementValue=placement)

    def overlay(self, bone, length, top_image, color):
        line = self.node(bone, 'Shape', bone.get('name') + '-bone-line')
        path = add(line, 'PointsPath', name='Bone axis', isClosed='false')
        add(path, 'StraightVertex', x=0, y=0)
        add(path, 'StraightVertex', x=length, y=0)
        stroke = add(line, 'Stroke', name='Bone stroke', thickness=3, transformAffectsStroke='false')
        add(stroke, 'SolidColor', name='Bone color', colorValue=color)
        self.draw_rule(line, top_image)
        joint = self.node(bone, 'Shape', bone.get('name') + '-joint')
        add(joint, 'Ellipse', name='Joint circle', width=10, height=10, originX=.5, originY=.5)
        fill = add(joint, 'Fill', name='Joint fill')
        add(fill, 'SolidColor', name='Joint color', colorValue=color)
        edge = add(joint, 'Stroke', name='Joint border', thickness=1.5)
        add(edge, 'SolidColor', name='Border color', colorValue='FF15171E')
        self.draw_rule(joint, top_image)

    def pose(self, frame):
        seconds = frame / FPS
        entry = smooth(1.5, 5.0, seconds)
        legs = smooth(3.6, 7.5, seconds)
        inner_legs = smooth(1.5, 7.5, seconds)
        travel = smooth(1.5, 3.8, seconds)
        white_pelvis = lerp((465, 760), (610, 735), travel)
        # A brief low scoot keeps the fixed ankle grip reachable while reclining.
        white_pelvis = (white_pelvis[0], white_pelvis[1] + 42 * math.sin(entry * math.pi))
        white_angle = -.61 + (-math.pi + .61) * entry
        far_hip_offset = self.source_offset('white', 'thigh_l')
        initial_far_hip = plus((465, 760), rotate(far_hip_offset, -.61))
        final_far_hip = plus((610, 735), rotate(far_hip_offset, -math.pi))
        current_far_hip = plus(white_pelvis, rotate(far_hip_offset, white_angle))
        far_foot = plus(current_far_hip,
                        polar_arc(minus((570, 822), initial_far_hip),
                                  minus((625, 600), final_far_hip), inner_legs))
        return {
            'blue': {'pelvis': (660, 470), 'spine': -math.pi / 2,
                     'ankle_l': (620, 760), 'ankle_r': (760, 730),
                     'hand_l': (554, 465), 'hand_r': (789, 440),
                     'foot_l': 1.959, 'foot_r': 1.116,
                     'knee_pole_l': (572, 620), 'knee_pole_r': (810, 610),
                     'elbow_pole_l': (460, 360), 'elbow_pole_r': (858, 345)},
            'white': {'pelvis': white_pelvis, 'spine': white_angle,
                      # The near foot starts raised against the captured calf.
                      # This keeps its fixed bend side above the mat throughout.
                      'ankle_r': lerp((600, 655), (600, 475), legs),
                      # A hip-relative polar arc cannot pass through the hip origin.
                      'ankle_l': far_foot,
                      'hand_r': (627, 752), 'hand_l': (611, 740),
                      'foot_r': .20 + (-math.pi / 2 - .20) * legs,
                      'foot_l': -.10 + .12 * inner_legs,
                      'knee_pole_r': (750, 620), 'knee_pole_l': (492, 684),
                      'elbow_pole_r': (556, 685), 'elbow_pole_l': (519, 813)},
            'stage': 'ankle_control' if seconds < 1.5 else ('recline_entry' if seconds < 5 else ('leg_placement' if seconds < 7.5 else 'hold')),
        }

    def rig(self, board, color, overlay):
        pose = self.pose(0)[color]
        body_len = self.length(color, 'torso')
        root = self.node(board, 'RootBone', color + '-spine',
                         x=pose['pelvis'][0], y=pose['pelvis'][1], length=body_len,
                         rotation=pose['spine'])
        bones = {'spine': root}
        images = {'torso': self.image(root, color, 'torso', overlay)}
        head = self.node(root, 'Bone', color + '-head', length=self.length(color, 'head'), rotation=0)
        bones['head'], images['head'] = head, self.image(head, color, 'head', overlay)
        for side in ('l', 'r'):
            # These offsets are the measured source joints in the torso's +X frame.
            shoulder = self.source_offset(color, 'upper_arm_' + side)
            hip = self.source_offset(color, 'thigh_' + side)
            for kind, source, offset in (('arm', 'upper_arm', shoulder), ('leg', 'thigh', hip)):
                part = source + '_' + side
                first = self.node(root, 'RootBone', color + '-' + part,
                                  x=offset[0], y=offset[1], length=self.length(color, part), rotation=0)
                bones[part], images[part] = first, self.image(first, color, part, overlay)
                following = ('forearm', 'hand') if kind == 'arm' else ('shin', 'foot')
                parent = first
                for word in following:
                    part = word + '_' + side
                    child = self.node(parent, 'Bone', color + '-' + part,
                                      length=self.length(color, part), rotation=0)
                    bones[part], images[part] = child, self.image(child, color, part, overlay)
                    parent = child
        return {'bones': bones, 'images': images}

    def values(self, color, pose):
        body, theta = pose['pelvis'], pose['spine']
        result = {('spine', 'x'): body[0], ('spine', 'y'): body[1], ('spine', 'rotation'): theta,
                  ('head', 'rotation'): 0}
        coordinates, errors = {}, []
        for side in ('l', 'r'):
            shoulder_offset = self.source_offset(color, 'upper_arm_' + side)
            hip_offset = self.source_offset(color, 'thigh_' + side)
            shoulder, hip = plus(body, rotate(shoulder_offset, theta)), plus(body, rotate(hip_offset, theta))
            ankle, palm = pose['ankle_' + side], pose['hand_' + side]
            hand_length = self.length(color, 'hand_' + side)
            palm_angle = angle_of(shoulder, palm)
            wrist = minus(palm, rotate((hand_length * .95, 0), palm_angle))
            elbow, arm_error = ik(shoulder, wrist, self.length(color, 'upper_arm_' + side),
                                 self.length(color, 'forearm_' + side), pose['elbow_pole_' + side],
                                 IK_BRANCH[(color, 'arm', side)])
            knee, leg_error = ik(hip, ankle, self.length(color, 'thigh_' + side),
                                self.length(color, 'shin_' + side), pose['knee_pole_' + side],
                                IK_BRANCH[(color, 'leg', side)])
            upper_angle, forearm_angle = angle_of(shoulder, elbow), angle_of(elbow, wrist)
            thigh_angle, shin_angle = angle_of(hip, knee), angle_of(knee, ankle)
            result[('upper_arm_' + side, 'rotation')] = upper_angle - theta
            result[('forearm_' + side, 'rotation')] = forearm_angle - upper_angle
            result[('hand_' + side, 'rotation')] = palm_angle - forearm_angle
            result[('thigh_' + side, 'rotation')] = thigh_angle - theta
            result[('shin_' + side, 'rotation')] = shin_angle - thigh_angle
            result[('foot_' + side, 'rotation')] = pose['foot_' + side] - shin_angle
            errors.extend((arm_error, leg_error))
            coordinates[side] = {'hip': hip, 'knee': knee, 'ankle': ankle, 'shoulder': shoulder,
                                 'elbow': elbow, 'wrist': wrist, 'palm_target': palm,
                                 'arm_reach_error_px': arm_error, 'leg_reach_error_px': leg_error}
        return result, coordinates, max(errors)

    def artboard(self, name, rig_overlay=False, editor_x=0):
        state_id, animation_id, style_id = self.ident(), self.ident(), self.ident()
        board = self.node(self.root, 'Artboard', name, width=1024, height=960,
                          x=editor_x, y=0, defaultStateMachineId=state_id, styleId=style_id)
        add(board, 'LayoutComponentStyle', name='Artboard style', id=style_id)
        rigs = {color: self.rig(board, color, rig_overlay) for color in ('white', 'blue')}
        # Explicit front-to-back ordering crosses bone trees without flattening them.
        order = [('white', p) for p in ('hand_r', 'forearm_r', 'upper_arm_r', 'foot_r', 'shin_r', 'thigh_r', 'head', 'torso')]
        order += [('blue', p) for p in ('hand_l', 'forearm_l', 'upper_arm_l', 'head', 'hand_r', 'forearm_r', 'upper_arm_r', 'torso', 'thigh_l', 'shin_l', 'foot_l', 'thigh_r', 'shin_r', 'foot_r')]
        order += [('white', p) for p in ('hand_l', 'forearm_l', 'upper_arm_l', 'foot_l', 'shin_l', 'thigh_l')]
        for previous, current in zip(order, order[1:]):
            anchor = rigs[previous[0]]['images'][previous[1]].get('id')
            self.draw_rule(rigs[current[0]]['images'][current[1]], anchor, 'after')
        front_id = rigs[order[0][0]]['images'][order[0][1]].get('id')
        if rig_overlay:
            for color, rig in rigs.items():
                tint = 'FFEFC25D' if color == 'white' else 'FF58D4E9'
                for part, bone in rig['bones'].items():
                    self.overlay(bone, float(bone.get('length')), front_id, tint)
        mat = self.node(board, 'Shape', 'Mat', x=512, y=865)
        add(mat, 'Rectangle', name='Mat base', width=930, height=110, cornerRadiusTL=22)
        fill = add(mat, 'Fill', name='Mat paint')
        add(fill, 'SolidColor', name='Mat color', colorValue='FF242B36')
        fill = add(board, 'Fill', name='Stage background')
        add(fill, 'SolidColor', name='Stage color', colorValue='FF15171E')
        animation = add(board, 'LinearAnimation', name='Single X entry and hold', id=animation_id,
                        fps=FPS, duration=DURATION, loopValue='oneShot')
        timelines = {}
        max_error = 0
        for frame in range(DURATION + 1):
            pose = self.pose(frame)
            report = {'frame': frame, 'stage': pose['stage']}
            for color, rig in rigs.items():
                values, coordinates, error = self.values(color, pose[color])
                max_error = max(max_error, error)
                report[color] = coordinates
                for (bone, prop), value in values.items():
                    ident = rig['bones'][bone].get('id')
                    timelines.setdefault((ident, prop), []).append((frame, value))
            if not rig_overlay and frame in (0, 36, 72, 108, 144, 180, 216, 240, 288):
                self.pose_report.append(report)
        for (object_id, property_name), samples in timelines.items():
            keyed = add(animation, 'KeyedObject', objectId=object_id)
            prop = add(keyed, 'KeyedProperty', property=property_name)
            # Unwrap rotations before native linear interpolation, avoiding a full spin.
            previous = None
            for frame, value in samples:
                if property_name == 'rotation' and previous is not None:
                    while value - previous > math.pi:
                        value -= 2 * math.pi
                    while value - previous < -math.pi:
                        value += 2 * math.pi
                    delta = abs(value - previous)
                    self.max_adjacent_rotation_delta = max(self.max_adjacent_rotation_delta, delta)
                    if delta > .35:
                        self.large_rotation_steps.append({'artboard': name, 'object_id': object_id,
                                                          'frame': frame, 'delta_radians': delta})
                add(prop, 'KeyFrameDouble', frame=frame, value=round(value, 7), interpolationType='linear')
                previous = value
        machine = add(board, 'StateMachine', name='Entry and hold', id=state_id)
        layer = self.node(machine, 'StateMachineLayer', 'Motion')
        # LayerState has editor-only stateName/x/y, but no Component.name.
        state = add(layer, 'AnimationState', id=self.ident(), animationId=animation_id,
                    stateName='Single X', x=240, y=0)
        entry = add(layer, 'EntryState', id=self.ident(), x=0, y=0)
        add(entry, 'StateTransition', stateToId=state.get('id'))
        add(layer, 'AnyState', id=self.ident(), x=0, y=-150)
        add(layer, 'ExitState', id=self.ident(), x=480, y=-150)
        return max_error


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, default=HERE / 'project' / 'asset-manifest.json')
    parser.add_argument('--project-dir', type=Path, default=HERE / 'project')
    args = parser.parse_args()
    parts = manifest_parts(args.manifest)
    project = Project(parts)
    errors = [project.artboard('Clean'), project.artboard('Rig', True, 1100)]
    args.project_dir.mkdir(parents=True, exist_ok=True)
    ET.indent(project.root, space='  ')
    xml = '<?xml version="1.0" encoding="utf-8"?>\n' + ET.tostring(project.root, encoding='unicode') + '\n'
    (args.project_dir / 'scene.rml').write_text(xml)
    (args.project_dir / 'rive.yaml').write_text('name: bjj-single-x-2d\nmain: Clean\noutput:\n  dir: build\nexclude:\n  - README.md\n')
    # Metadata goes to stdout, so this generator owns no extra output files.
    print(json.dumps({'project': str(args.project_dir), 'bones_per_artboard': 28,
                      'artboards': ['Clean', 'Rig'], 'fps': FPS, 'duration_frames': DURATION,
                      'scale': SCALE, 'max_reach_error_px': max(errors),
                      'fixed_ik_branches': {':'.join(k): v for k, v in IK_BRANCH.items()},
                      'max_adjacent_rotation_delta_radians': project.max_adjacent_rotation_delta,
                      'rotation_steps_over_0_35rad': project.large_rotation_steps,
                      'pose_samples': project.pose_report}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
