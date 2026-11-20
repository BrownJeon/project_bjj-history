#!/usr/bin/env python3
"""Task-061: self-contained articulated SLX study; run with Blender 4.5 LTS."""
import argparse
import json
import math
import random
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Vector


def arguments():
    p = argparse.ArgumentParser()
    p.add_argument('--output-dir', required=True)
    p.add_argument('--preview-frames', default='1,72,144,240')
    p.add_argument('--render-all', action='store_true')
    p.add_argument('--samples', type=int, default=32)
    p.add_argument('--resolution-percent', type=int, default=100)
    return p.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])


ARGS = arguments()
OUT = Path(ARGS.output_dir).expanduser().resolve()
OUT.mkdir(parents=True, exist_ok=True)
FPS, LAST = 24, 288
random.seed(61)


def material(name, color, roughness=.72, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = (*color, 1)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Roughness'].default_value = roughness
    p.inputs['Metallic'].default_value = metallic
    return m


def assign(o, m):
    o.data.materials.append(m)
    for f in getattr(o.data, 'polygons', []):
        f.use_smooth = True
    return o


def parent_local(o, parent):
    if parent:
        o.parent = parent
    return o


def empty(name, parent=None):
    o = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(o)
    o.empty_display_size = .04
    parent_local(o, parent)
    return o


def sphere(name, loc, scale, m, parent=None, segments=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=rings, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = scale
    assign(o, m)
    parent_local(o, parent)
    return o


def mesh(name, vertices, faces, m, parent=None):
    d = bpy.data.meshes.new(name)
    d.from_pydata(vertices, [], faces)
    d.update()
    o = bpy.data.objects.new(name, d)
    bpy.context.collection.objects.link(o)
    assign(o, m)
    parent_local(o, parent)
    return o


def profile(name, rows, m, parent=None, count=24):
    """Smooth tailored ring surface: (height, half-width, half-depth)."""
    vs, fs = [], []
    for z, rx, ry in rows:
        for j in range(count):
            a = 2 * math.pi * j / count
            # small cloth irregularity, deterministic and subdued
            fold = 1 + .013 * math.cos(6 * a + z * 3)
            vs.append((rx * math.cos(a) * fold, ry * math.sin(a) * fold, z))
    fs.append(tuple(reversed(range(count))))
    for i in range(len(rows) - 1):
        for j in range(count):
            a, b = i * count + j, i * count + (j + 1) % count
            fs.append((a, b, b + count, a + count))
    fs.append(tuple(range((len(rows) - 1) * count, len(rows) * count)))
    o = mesh(name, vs, fs, m, parent)
    bevel = o.modifiers.new('Soft sewn edges', 'BEVEL')
    bevel.width = .008
    bevel.segments = 2
    return o


def tube(name, pts, radius, m, parent=None):
    c = bpy.data.curves.new(name, 'CURVE')
    c.dimensions = '3D'
    c.resolution_u = 12
    c.bevel_depth = radius
    c.bevel_resolution = 3
    s = c.splines.new('BEZIER')
    s.bezier_points.add(len(pts) - 1)
    for b, p in zip(s.bezier_points, pts):
        b.co = p
        b.handle_left_type = 'AUTO'
        b.handle_right_type = 'AUTO'
    o = bpy.data.objects.new(name, c)
    bpy.context.collection.objects.link(o)
    c.materials.append(m)
    parent_local(o, parent)
    return o


def box(name, loc, dimensions, m, parent=None, bevel=.03):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.name = name
    o.scale = dimensions
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    assign(o, m)
    if bevel:
        b = o.modifiers.new('Rounded edges', 'BEVEL')
        b.width, b.segments = bevel, 3
        o.modifiers.new('Weighted corner normals', 'WEIGHTED_NORMAL')
    parent_local(o, parent)
    return o


def basis(right, up, loc):
    x, z = Vector(right).normalized(), Vector(up).normalized()
    y = z.cross(x).normalized()
    x = y.cross(z).normalized()
    m = Matrix((x, y, z)).transposed().to_4x4()
    m.translation = Vector(loc)
    return m


def set_matrix(o, m, frame):
    o.matrix_world = m
    o.rotation_mode = 'QUATERNION'
    o.keyframe_insert(data_path='location', frame=frame)
    o.keyframe_insert(data_path='rotation_quaternion', frame=frame)
    o.keyframe_insert(data_path='scale', frame=frame)


def segment(o, a, b, frame):
    a, b = Vector(a), Vector(b)
    d = b - a
    m = d.to_track_quat('Z', 'Y').to_matrix().to_4x4()
    m.translation = a
    m = m @ Matrix.Diagonal((1, 1, max(d.length, .001), 1))
    set_matrix(o, m, frame)


def ik(root, end, first, second, pole):
    r, e = Vector(root), Vector(end)
    d = e - r
    length = min(max(d.length, .025), first + second - .005)
    direction = d.normalized()
    along = (first * first - second * second + length * length) / (2 * length)
    height = math.sqrt(max(first * first - along * along, .0001))
    bend = Vector(pole) - r
    bend -= direction * bend.dot(direction)
    if bend.length < .001:
        bend = direction.cross(Vector((0, 0, 1)))
    return r + direction * along + bend.normalized() * height


def mix(a, b, t):
    return Vector(a).lerp(Vector(b), t)


def smooth(a, b, t):
    t = min(1., max(0., (t - a) / (b - a)))
    return t * t * (3 - 2 * t)


def make_hand(name, skin):
    e = empty(name)
    sphere(name + '.palm', (0, 0, .047), (.043, .026, .058), skin, e)
    # Four gently curled fingers; thumb on the side preserves a hand silhouette.
    for i, x in enumerate((-.029, -.010, .010, .029)):
        l = (.038, .047, .045, .034)[i]
        o = sphere(name + '.finger' + str(i), (x, -.009, .100 + l * .25), (.010, .014, l), skin, e, 12, 8)
        o.rotation_euler.x = .35
    o = sphere(name + '.thumb', (.047, -.006, .060), (.016, .020, .038), skin, e, 12, 8)
    o.rotation_euler.y = -.65
    return e


def make_foot(name, skin):
    e = empty(name)
    sphere(name + '.heel', (0, .010, -.040), (.047, .055, .048), skin, e)
    sphere(name + '.instep', (0, -.063, -.041), (.049, .098, .040), skin, e)
    for i, x in enumerate((-.034, -.015, .003, .020, .035)):
        sphere(name + '.toe' + str(i), (x, -.150 + .008 * i, -.046), (.012 - .001 * i, .026 - .002 * i, .022), skin, e, 12, 8)
    return e


def continuous_limb(name, length_a, length_b, kind, gi, trim):
    """One garment mesh, skinned across a real two-bone armature."""
    arm_data = bpy.data.armatures.new(name + '.bones')
    arm = bpy.data.objects.new(name, arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode='EDIT')
    a = arm_data.edit_bones.new('proximal')
    a.head, a.tail = (0, 0, 0), (0, 0, length_a)
    b = arm_data.edit_bones.new('distal')
    b.head, b.tail = a.tail, (0, 0, length_a + length_b)
    b.parent, b.use_connect = a, True
    bpy.ops.object.mode_set(mode='OBJECT')
    arm.select_set(False)
    total = length_a + length_b
    ring_count, around = 25, 20
    verts, faces, weights = [], [], []
    for i in range(ring_count):
        z = total * i / (ring_count - 1)
        fraction = z / total
        if kind == 'arm':
            width = .091 - .019 * fraction + .008 * math.sin(math.pi * fraction)
            depth = width * .94
        else:
            width = .116 - .036 * fraction + .010 * math.sin(1.3 * math.pi * fraction)
            depth = width * .98
        # Blended weights create a fabric elbow/knee rather than separated blocks.
        distal = smooth(length_a - .095, length_a + .095, z)
        for j in range(around):
            angle = j * 2 * math.pi / around
            fold = 1 + .017 * math.cos(6 * angle + z * 8)
            verts.append((math.cos(angle) * width * fold,
                          math.sin(angle) * depth * fold, z))
            weights.append(distal)
    faces.append(tuple(reversed(range(around))))
    for i in range(ring_count - 1):
        for j in range(around):
            k = i * around + j
            nxt = i * around + (j + 1) % around
            faces.append((k, nxt, nxt + around, k + around))
    faces.append(tuple(range((ring_count - 1) * around, ring_count * around)))
    cloth = mesh(name + '.continuous_garment', verts, faces, gi)
    cloth.data.materials.append(trim)
    for polygon in cloth.data.polygons:
        # Two narrow rings form the folded stitched cuff.
        if min(cloth.data.vertices[v].co.z for v in polygon.vertices) > total * .95:
            polygon.material_index = 1
    group_a, group_b = cloth.vertex_groups.new(name='proximal'), cloth.vertex_groups.new(name='distal')
    for i, w in enumerate(weights):
        if w < 1:
            group_a.add([i], 1 - w, 'REPLACE')
        if w > 0:
            group_b.add([i], w, 'REPLACE')
    modifier = cloth.modifiers.new('Continuous fabric skin', 'ARMATURE')
    modifier.object = arm
    modifier.use_deform_preserve_volume = True
    sub = cloth.modifiers.new('Smooth cotton silhouette', 'SUBSURF')
    sub.levels = 1
    cloth.parent = arm
    # Both transforms are identity in the bind pose.
    for bone in arm.pose.bones:
        bone.rotation_mode = 'QUATERNION'
    return {'armature': arm, 'length_a': length_a, 'length_b': length_b}


def animate_limb(rig, start, middle, end, frame):
    start, middle, end = Vector(start), Vector(middle), Vector(end)
    upper = (middle - start).to_track_quat('Z', 'Y')
    m = upper.to_matrix().to_4x4()
    m.translation = start
    set_matrix(rig['armature'], m, frame)
    local_lower = upper.inverted() @ (end - middle).normalized()
    distal = rig['armature'].pose.bones['distal']
    bind_rotation = rig['armature'].data.bones['distal'].matrix_local.to_quaternion()
    align = local_lower.to_track_quat('Z', 'Y')
    distal.rotation_quaternion = bind_rotation.inverted() @ align @ bind_rotation
    distal.scale = (1, (end - middle).length / rig['length_b'], 1)
    distal.keyframe_insert(data_path='rotation_quaternion', frame=frame)
    distal.keyframe_insert(data_path='scale', frame=frame)


def make_character(label, gi, trim, hair, eye, skin):
    body = empty(label + '.torso_control')
    profile(label + '.jacket', [(0, .170, .118), (.06, .184, .125), (.18, .170, .116), (.34, .212, .128), (.48, .231, .113), (.53, .174, .100)], gi, body)
    # Separate coat skirt panels and sewn hem make the silhouette read as a gi.
    profile(label + '.jacket_skirt', [(-.070, .183, .132), (.02, .183, .124), (.13, .164, .116)], gi, body)
    tube(label + '.hem', [(math.cos(i * math.pi / 8) * .185, math.sin(i * math.pi / 8) * .134, -.052) for i in range(17)], .004, trim, body)
    # V-neck insert and thick crossed lapels.
    mesh(label + '.neck_insert', [(-.070, -.108, .53), (.070, -.108, .53), (0, -.139, .35)], [(0, 1, 2)], skin, body)
    tube(label + '.left_lapel', [(-.073, -.112, .55), (-.079, -.132, .47), (-.015, -.145, .32), (.073, -.141, .095)], .019, trim, body)
    tube(label + '.right_lapel', [(.073, -.112, .55), (.080, -.132, .46), (.015, -.148, .31), (-.070, -.142, .10)], .018, trim, body)
    tube(label + '.left_lapel_stitch', [(-.069, -.130, .53), (-.066, -.151, .43), (.080, -.161, .10)], .0018, gi, body)
    sphere(label + '.neck', (0, 0, .572), (.052, .055, .069), skin, body)
    # Broad flat brown belt, knot and two loose ends.
    profile(label + '.brown_belt', [(.080, .180, .137), (.143, .178, .135)], BROWN, body)
    for z in (.089, .102, .118, .134):
        tube(label + '.belt_seam', [(math.cos(i * math.pi / 12) * .181, math.sin(i * math.pi / 12) * .138, z) for i in range(25)], .0018, BELT_STITCH, body)
    sphere(label + '.belt_knot', (0, -.152, .112), (.050, .030, .039), BROWN, body)
    o = box(label + '.belt_tail_a', (-.035, -.162, -.018), (.047, .019, .225), BROWN, body, .007)
    o.rotation_euler.y = -.12
    o = box(label + '.belt_tail_b', (.041, -.160, -.002), (.046, .018, .194), BROWN, body, .007)
    o.rotation_euler.y = .17
    # Head has a jaw/chin, ears, eyes with iris/highlights and eyebrows.
    head = empty(label + '.head', body)
    head.location = (0, 0, .715)
    head.rotation_euler.x = .10 if label == 'Blue' else -.07
    sphere(label + '.head_skin', (0, 0, 0), (.100, .084, .136), skin, head, 28, 20)
    sphere(label + '.jaw', (0, -.010, -.071), (.067, .066, .062), skin, head)
    for sign in (-1, 1):
        sphere(label + '.ear', (sign * .100, .003, -.014), (.017, .016, .033), skin, head, 16, 10)
        sphere(label + '.eye_white', (sign * .041, -.077, .019), (.027, .004, .012), EYE_WHITE, head)
        sphere(label + '.iris', (sign * .041, -.081, .018), (.010, .0020, .0105), eye, head, 16, 12)
        sphere(label + '.pupil', (sign * .041, -.083, .018), (.0045, .0015, .007), INK, head, 12, 8)
        sphere(label + '.eye_glint', (sign * .041 - .002, -.085, .022), (.002, .001, .002), EYE_WHITE, head, 8, 6)
        tube(label + '.eyelid', [(sign * .065, -.077, .026), (sign * .041, -.085, .031), (sign * .018, -.079, .025)], .0021, INK, head)
        tube(label + '.eyebrow', [(sign * .065, -.070, .049), (sign * .041, -.077, .052), (sign * .018, -.074, .046)], .0025, BROW, head)
    nose = mesh(label + '.nose', [(-.009, -.080, -.013), (.009, -.080, -.013), (0, -.101, -.027), (0, -.082, .008)], [(0, 1, 2), (0, 2, 3), (1, 3, 2)], skin, head)
    bevel = nose.modifiers.new('Soft nose edge', 'BEVEL')
    bevel.width, bevel.segments = .002, 2
    tube(label + '.mouth', [(-.020, -.078, -.062), (0, -.082, -.065), (.020, -.078, -.062)], .0014, LIP, head)
    # Open-front scalp surface, with side and back coverage down toward the nape.
    vs, fs, around, rings = [], [], 32, 10
    for r in range(rings):
        for j in range(around):
            a = 2 * math.pi * j / around
            maximum = 1.32 + .87 * (math.sin(a) + 1) / 2
            theta = .015 + maximum * r / (rings - 1)
            vs.append((.110 * math.sin(theta) * math.cos(a),
                       .104 * math.sin(theta) * math.sin(a) + .009,
                       .036 + .143 * math.cos(theta)))
    for r in range(rings - 1):
        for j in range(around):
            a, b = r * around + j, r * around + (j + 1) % around
            fs.append((a, b, b + around, a + around))
    mesh(label + '.layered_hair_cap', vs, fs, hair, head)
    # Long tapered locks on crown, temples, bangs and nape; no Subsurf rounds tips.
    locks = []
    for i in range(18):
        a = i * 2.399963
        x, y = math.cos(a), math.sin(a)
        locks.append(((x * .045, y * .045 + .008, .146),
                      (x * (.135 + .016 * (i % 3)), y * .125 + .008,
                       .070 + .065 * (i % 4) / 3), .025))
    for side in (-1, 1):
        for i in range(5):
            locks.append(((side * .075, -.010 + .028 * i, .102 - .015 * i),
                          (side * (.140 + .007 * (i % 2)), -.014 + .026 * i,
                           -.026 - .014 * i), .024))
    for i in range(9):
        x = (i - 4) * .019
        locks.append(((x * .65, -.046, .133),
                      (x + .014 * math.sin(i), -.112 - .008 * (i % 2),
                       .055 + .010 * (i % 3)), .021))
    for i in range(8):
        a = .15 + math.pi * i / 7
        locks.append(((math.cos(a) * .075, .055 + math.sin(a) * .033, .069),
                      (math.cos(a) * .113, .080 + math.sin(a) * .065, -.083), .023))
    for i, (start, finish, width) in enumerate(locks):
        start, finish = Vector(start), Vector(finish)
        direction = (finish - start).normalized()
        side = direction.cross(Vector((0, 0, 1)))
        if side.length < .01:
            side = Vector((1, 0, 0))
        side.normalize()
        normal = side.cross(direction).normalized()
        verts, faces = [], []
        for t, scale in ((0, .7), (.25, 1), (.58, .8), (.85, .35), (1, .006)):
            center = start.lerp(finish, t) + normal * (.012 * math.sin(t * math.pi))
            for j in range(6):
                a = j * math.pi / 3
                v = center + side * (math.cos(a) * width * scale) + normal * (math.sin(a) * width * .40 * scale)
                verts.append(tuple(v))
        for r in range(4):
            for j in range(6):
                faces.append((r * 6 + j, r * 6 + (j + 1) % 6, (r + 1) * 6 + (j + 1) % 6, (r + 1) * 6 + j))
        mesh(label + '.tapered_hair_lock_%02d' % i, verts, faces, hair, head)
    result = {'body': body, 'hands': {}, 'feet': {}, 'limbs': {}, 'joints': {}}
    for side in ('outer', 'inner'):
        result['limbs'][(side, 'arm')] = continuous_limb(label + '.' + side + '.arm', .335, .280, 'arm', gi, trim)
        result['limbs'][(side, 'leg')] = continuous_limb(label + '.' + side + '.leg', .447, .440, 'leg', gi, trim)
        result['hands'][side] = make_hand(label + '.' + side + '.hand', skin)
        result['feet'][side] = make_foot(label + '.' + side + '.foot', skin)
    return result


def points_for(frame):
    t = (frame - 1) / FPS
    recline, connect = smooth(1.3, 4.6, t), smooth(3.2, 6.6, t)
    # Small breathing is confined to Blue's spine; all support/contact targets stay fixed.
    breath = .006 * math.sin(t * math.pi * .8) * smooth(6.6, 8, t)
    blue_body = basis((1, 0, 0), (0, -.10 - breath, 1), (0, .045, .985))
    angle = -.25 + (math.pi / 2 - .025 + .25) * recline
    # Begin slightly beside the captured leg so the reaching forearm is readable,
    # then align the pelvis underneath it while reclining into the guard.
    white_right = mix((-.7071, .7071, 0), (-1, 0, 0), recline)
    white_body = basis(white_right, (0, -math.sin(angle), math.cos(angle)), mix((-.12, -.48, .24), (.13, -.205, .185), recline))
    return {
        'Blue': {'body': blue_body,
                 'ankle_outer': Vector((.205, -.080, .135)), 'ankle_inner': Vector((-.285, .180, .135)),
                 'hand_outer': Vector((.480, -.350, 1.245)), 'hand_inner': Vector((-.390, -.330, 1.075)),
                 'knee_pole_outer': (.25, -.55, .50), 'knee_pole_inner': (-.30, -.45, .48),
                 'elbow_pole_outer': (.64, -.12, 1.23), 'elbow_pole_inner': (-.64, -.09, 1.2)},
        'White': {'body': white_body,
                  'ankle_outer': mix((.38, -.08, .145), (.225, -.048, .965), connect),
                  'ankle_inner': mix((-.13, .04, .145), (.180, -.035, .620), connect),
                  'hand_outer': Vector((.310, -.160, .225)), 'hand_inner': Vector((.125, -.105, .295)),
                  'knee_pole_outer': (.33, -.38, .58), 'knee_pole_inner': (.06, -.33, .62),
                  'elbow_pole_outer': (.55, -.45, .22), 'elbow_pole_inner': (-.30, -.45, .20)},
        'stage': 'prepare_ankle_control' if t < 1.3 else ('recline_enter' if t < 4.6 else ('set_hip_and_inside_hook' if t < 6.6 else 'hold')),
        'recline': recline, 'connect': connect,
    }


def animate_character(c, p, label, frame):
    body = p['body']
    set_matrix(c['body'], body, frame)
    output = {'pelvis': list(body.translation)}
    for side, sign in (('outer', 1), ('inner', -1)):
        # Both characters use an outer-side convention in world X, regardless of facing.
        local_sign = sign if label == 'Blue' else -sign
        hip = body @ Vector((local_sign * .125, 0, .005))
        shoulder = body @ Vector((local_sign * .207, 0, .468))
        ankle, hand = p['ankle_' + side], p['hand_' + side]
        knee = ik(hip, ankle, .447, .440, p['knee_pole_' + side])
        elbow = ik(shoulder, hand, .335, .335, p['elbow_pole_' + side])
        # End the cloth sleeve at the wrist, before palm/fingers.
        hand_dir = (hand - elbow).normalized()
        wrist = hand - hand_dir * .055
        animate_limb(c['limbs'][(side, 'leg')], hip, knee, ankle, frame)
        animate_limb(c['limbs'][(side, 'arm')], shoulder, elbow, wrist, frame)
        hm = hand_dir.to_track_quat('Z', 'Y').to_matrix().to_4x4()
        hm.translation = wrist
        set_matrix(c['hands'][side], hm, frame)
        if label == 'Blue':
            foot_mat = Matrix.Identity(4)
        else:
            q = points_for(frame)['connect']
            rest = Matrix.Identity(4).to_quaternion()
            if side == 'outer':
                target = Matrix(((0, 0, 1), (-1, 0, 0), (0, -1, 0))).to_quaternion()
            else:
                target = Matrix(((0, -1, 0), (0, 0, 1), (-1, 0, 0))).to_quaternion()
            foot_mat = rest.slerp(target, q).to_matrix().to_4x4()
        foot_mat.translation = ankle
        set_matrix(c['feet'][side], foot_mat, frame)
        output[side] = {key: list(val) for key, val in (('hip', hip), ('knee', knee), ('ankle', ankle), ('shoulder', shoulder), ('elbow', elbow), ('palm', hand))}
    return output


def light(name, loc, power, color, size, target):
    bpy.ops.object.light_add(type='AREA', location=loc)
    o = bpy.context.object
    o.name = name
    o.data.energy, o.data.color, o.data.shape, o.data.size = power, color, 'DISK', size
    o.rotation_euler = (Vector(target) - o.location).to_track_quat('-Z', 'Y').to_euler()


bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
SKIN = material('Warm skin', (.74, .53, .40), .7)
BLUE_GI = material('Indigo blue gi cotton', (.007, .030, .145))
BLUE_TRIM = material('Blue lapel and stitching', (.014, .052, .200))
WHITE_GI = material('Ivory white gi cotton', (.65, .68, .70))
WHITE_TRIM = material('White folded lapel', (.83, .85, .84))
BROWN = material('Brown belt', (.195, .090, .043))
BELT_STITCH = material('Belt stitches', (.28, .155, .075))
WHITE_HAIR = material('Silver white hair', (.79, .84, .93), .5)
BLACK_HAIR = material('Warm black hair', (.022, .018, .023), .5)
BLUE_EYE = material('Blue iris', (.035, .34, .77), .35)
BROWN_EYE = material('Brown iris', (.24, .095, .025), .4)
EYE_WHITE = material('Eyes and glints', (.95, .96, .96), .35)
INK = material('Eyes detail', (.012, .016, .023))
LIP = material('Subtle facial line', (.29, .12, .09))
BROW = material('Soft dark brows', (.055, .045, .050))
FLOOR = material('Studio background', (.022, .031, .045))
MAT = material('Tatami charcoal blue', (.095, .137, .169))
MAT_EDGE = material('Mat border', (.16, .27, .29))
for cotton in (BLUE_GI, BLUE_TRIM, WHITE_GI, WHITE_TRIM):
    nodes, links = cotton.node_tree.nodes, cotton.node_tree.links
    noise = nodes.new('ShaderNodeTexNoise')
    noise.inputs['Scale'].default_value = 180
    noise.inputs['Detail'].default_value = 2
    bump = nodes.new('ShaderNodeBump')
    bump.inputs['Strength'].default_value = .12
    bump.inputs['Distance'].default_value = .0014
    links.new(noise.outputs['Fac'], bump.inputs['Height'])
    links.new(bump.outputs['Normal'], nodes.get('Principled BSDF').inputs['Normal'])

box('studio_floor', (0, 0, -.17), (200, 200, .20), FLOOR, bevel=0)
box('raised_tatami_base', (0, -.35, -.045), (3.15, 3.10, .16), MAT_EDGE, bevel=.075)
box('tatami_surface', (0, -.35, .022), (3.03, 2.98, .047), MAT, bevel=.035)
# Fine mat seams make ground contact readable without visual clutter.
for x in (-.76, 0, .76):
    tube('tatami_join', [(x, -1.80, .047), (x, 1.10, .047)], .002, MAT_EDGE)
for y in (-1.10, -.35, .40):
    tube('tatami_join', [(-1.47, y, .047), (1.47, y, .047)], .002, MAT_EDGE)

characters = {
    'Blue': make_character('Blue', BLUE_GI, BLUE_TRIM, WHITE_HAIR, BLUE_EYE, SKIN),
    'White': make_character('White', WHITE_GI, WHITE_TRIM, BLACK_HAIR, BROWN_EYE, SKIN),
}

metadata = {'schema_version': 1, 'task': 'task-061', 'fps': FPS, 'frames': LAST,
            'technique': 'single_x_guard_entry_and_hold', 'blue_role': 'standing', 'white_role': 'guard',
            'representation': 'procedural_stylized_3d_reference_based',
            'educational_accuracy_verified': False, 'external_assets': [], 'poses': []}
for frame in range(1, LAST + 1):
    pose = points_for(frame)
    item = {'frame': frame, 'seconds': (frame - 1) / FPS, 'stage': pose['stage']}
    for label, character in characters.items():
        item[label] = animate_character(character, pose[label], label, frame)
    if frame in (1, 36, 72, 108, 144, 168, 192, 240, 288):
        metadata['poses'].append(item)

# Dense baked keys are linear: the exact IK sample at each frame is preserved.
for action in bpy.data.actions:
    for curve in getattr(action, 'fcurves', []):
        for kp in curve.keyframe_points:
            kp.interpolation = 'LINEAR'

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.eevee.taa_render_samples = max(1, ARGS.samples)
scene.render.resolution_x, scene.render.resolution_y = 960, 720
scene.render.resolution_percentage = ARGS.resolution_percent
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 1, LAST
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'
scene.render.film_transparent = False
scene.world.color = (.06, .07, .09)
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.render.use_file_extension = True
scene.render.film_transparent = False
light('large_soft_key', (2.5, -3.8, 5.0), 650, (1.0, .88, .75), 4.0, (0, -.3, .7))
light('cool_fill', (-3, -1, 3), 430, (.57, .73, 1), 3, (0, -.3, .8))
light('hair_rim', (1.2, 3, 4), 850, (.78, .90, 1), 2.5, (0, -.2, 1))
bpy.ops.object.camera_add(location=(4.7, -3.5, 2.75))
camera = bpy.context.object
camera.name = 'Technique three-quarter camera'
camera.rotation_euler = (Vector((.03, -.35, .82)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
camera.data.type = 'ORTHO'
camera.data.ortho_scale = 3.15
camera.data.lens = 48
scene.camera = camera
scene.frame_set(168)
scene.render.filepath = '//frames/frame-'
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'single-x-guard-sample.blend'))
(OUT / 'pose-metadata.json').write_text(json.dumps(metadata, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(OUT / 'build-info.json').write_text(json.dumps({'blender': bpy.app.version_string, 'fps': FPS, 'frames': LAST, 'size': [960, 720], 'resolution_percent': ARGS.resolution_percent, 'samples': ARGS.samples, 'render_engine': scene.render.engine, 'external_services': [], 'render_all': ARGS.render_all}, indent=2) + '\n')
print('TASK061_SCENE_READY', str(OUT), flush=True)

previews = sorted({int(f.strip()) for f in ARGS.preview_frames.split(',') if f.strip()})
for frame in previews:
    if 1 <= frame <= LAST:
        scene.frame_set(frame)
        scene.render.filepath = str(OUT / ('preview-%04d.png' % frame))
        bpy.ops.render.render(write_still=True)
if ARGS.render_all:
    frames = OUT / 'frames'
    frames.mkdir(exist_ok=True)
    scene.render.filepath = str(frames / 'frame-')
    bpy.ops.render.render(animation=True)
print('TASK061_FINISHED', flush=True)
