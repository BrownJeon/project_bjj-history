#!/usr/bin/env python3
"""Build one persistent native Rive vector character and constrained bone rig.

No image generation, external assets, downloads, scripting in Rive, or service
changes. Limits describe this conservative sample, not medical normal ranges.
RML rotations and RotationConstraint min/max are radians. Child Bone origins
are the parent bone tip; only pelvis translation and local rotations animate.
"""
import json
import math
from pathlib import Path
import xml.etree.ElementTree as ET

HERE = Path(__file__).resolve().parent
OUT = HERE / 'project'
RAD = math.pi / 180


def add(parent, kind, **attributes):
    return ET.SubElement(parent, kind, {k: str(v) for k, v in attributes.items()})


def smooth(a, b, t):
    v = min(1., max(0., (t-a)/(b-a)))
    return v*v*(3-2*v)


def wave(t, start, peak, hold, end):
    return smooth(start, peak, t) * (1-smooth(hold, end, t))


def rotate(point, angle):
    c, s = math.cos(angle), math.sin(angle)
    return [point[0]*c-point[1]*s, point[0]*s+point[1]*c]


def plus(a, b):
    return [a[0]+b[0], a[1]+b[1]]


def solve_leg(hip, ankle, a, b):
    dx, dy = ankle[0]-hip[0], ankle[1]-hip[1]
    d = math.hypot(dx, dy)
    if not abs(a-b) < d <= a+b:
        raise ValueError('Unreachable stance ankle')
    # Fixed branch: knee stays in front/right of the hip-to-ankle line.
    upper = math.atan2(dy, dx)-math.acos(max(-1., min(1., (a*a+d*d-b*b)/(2*a*d))))
    knee = math.pi-math.acos(max(-1., min(1., (a*a+b*b-d*d)/(2*a*b))))
    return upper, knee


def fk(profile, root_xy, rotations):
    result = {}
    for bone in profile['bones']:
        name, parent, length = bone['name'], bone['parent'], bone['length']
        origin = root_xy if parent is None else result[parent]['tip']
        angle = rotations[name]+(0 if parent is None else result[parent]['world_rotation_rad'])
        result[name] = {'origin': list(origin), 'tip': plus(origin, rotate([length, 0], angle)),
                        'world_rotation_rad': angle, 'local_rotation_rad': rotations[name],
                        'length': length, 'scale': [1, 1]}
    return result


def pose(profile, frame):
    t = frame/profile['fps']
    curl = wave(t, 1., 2., 2.6, 4.)
    knee = wave(t, 4.5, 5.75, 6.25, 7.5)
    squat = wave(t, 8., 9.5, 11., 13.)
    root = [profile['neutral_root'][0]-35*squat,
            profile['neutral_root'][1]+22*squat]
    spine = (-90+22*squat)*RAD
    angles = {bone['name']: bone['bind_local_rotation_deg']*RAD for bone in profile['bones']}
    angles.update(pelvis=0., spine=spine, neck=-11*squat*RAD, head=0.)
    for side in ('near', 'far'):
        upper, bend = solve_leg(root, profile['stance_ankles'][side], 155, 155)
        if side == 'near' and knee > 0:
            bend += (65*RAD-bend)*knee
        foot_world = 40*RAD*knee*knee if side == 'near' else 0.
        angles['thigh_'+side] = upper
        angles['shin_'+side] = bend
        angles['foot_'+side] = foot_world-upper-bend
        arm_world = ((90 if side == 'near' else 82)-25*squat)*RAD
        angles['upper_arm_'+side] = arm_world-spine
        angles['forearm_'+side] = (-80*curl-25*squat if side == 'near' else -5-20*squat)*RAD
        angles['hand_'+side] = 0.
    bones = fk(profile, root, angles)
    contacts = {}
    for side in ('near', 'far'):
        foot = bones['foot_'+side]
        markers = {key: plus(foot['origin'], rotate(local, foot['world_rotation_rad']))
                   for key, local in profile['foot_markers_local'].items()}
        contacts[side] = {**markers, 'ankle': foot['origin'],
                          'required': not (side == 'near' and 4.5 < t < 7.5)}
    stage = ('neutral' if t < 1 else 'elbow_curl' if t < 4 else
             'neutral' if t < 4.5 else 'knee_flex' if t < 7.5 else
             'neutral' if t < 8 else 'shallow_squat' if t < 13 else 'neutral')
    return {'frame': frame, 'time_seconds': t, 'stage': stage, 'root': {'x': root[0], 'y': root[1]},
            'local_rotations_rad': angles, 'bones': bones, 'contacts': contacts}


class Drawing:
    def __init__(self, profile):
        self.profile, self.serial = profile, 1
        self.root = ET.Element('Rive', version='1', kind='fragment')

    def ident(self):
        self.serial += 1
        return f'0:{self.serial}'

    def node(self, parent, kind, name, **attrs):
        return add(parent, kind, name=name, id=self.ident(), **attrs)

    def paint(self, shape, color, edge=None, thickness=2):
        fill = self.node(shape, 'Fill', 'Color')
        self.node(fill, 'SolidColor', 'Paint', colorValue=color)
        if edge:
            stroke = self.node(shape, 'Stroke', 'Outline', thickness=thickness)
            self.node(stroke, 'SolidColor', 'Outline paint', colorValue=edge)

    def shape(self, parent, name, color, geometry, edge=None):
        shape = self.node(parent, 'Shape', name)
        geometry(shape)
        self.paint(shape, color, edge)
        self.layers.append(shape)
        return shape

    def rect(self, parent, name, x, y, w, h, color, radius=0, edge=None):
        return self.shape(parent, name, color, lambda s: self.node(
            s, 'Rectangle', name+' path', x=x, y=y, width=w, height=h,
            cornerRadiusTL=radius), edge)

    def ellipse(self, parent, name, x, y, w, h, color, edge=None):
        return self.shape(parent, name, color, lambda s: self.node(
            s, 'Ellipse', name+' path', x=x, y=y, width=w, height=h), edge)

    def polygon(self, parent, name, points, color, edge=None):
        def path(shape):
            p = self.node(shape, 'PointsPath', name+' path', isClosed='true')
            for x, y in points:
                self.node(p, 'StraightVertex', 'Vertex', x=x, y=y)
        return self.shape(parent, name, color, path, edge)

    def line(self, parent, name, points, color, thickness):
        shape = self.node(parent, 'Shape', name)
        path = self.node(shape, 'PointsPath', 'Line path', isClosed='false')
        for x, y in points:
            self.node(path, 'StraightVertex', 'Vertex', x=x, y=y)
        stroke = self.node(shape, 'Stroke', 'Line stroke', thickness=thickness)
        self.node(stroke, 'SolidColor', 'Line paint', colorValue=color)
        self.layers.append(shape)
        return shape

    def art(self, bones):
        blue, light, dark = 'FF2866AA', 'FF4A87C6', 'FF183D69'
        skin, skinlight, brown = 'FFECC2A0', 'FFF4D2B6', 'FF795136'
        for side in ('far', 'near'):
            tint = 'FF204C7D' if side == 'far' else blue
            shade = 'FF34699A' if side == 'far' else light
            for part, length, width in [('thigh',155,65), ('shin',155,53)]:
                b = bones[part+'_'+side]
                self.rect(b, part+' cloth', length/2, 0, length+25, width, tint, width/2)
                self.line(b, part+' fold', [(18,-width*.2),(length-15,-width*.22)], shade, 3)
                if part == 'shin':
                    self.rect(b, 'Trouser cuff', length-4, 0, 16, width-4, dark, 3)
            b = bones['foot_'+side]
            self.polygon(b, 'Bare foot', [(-24,12),(-25,-1),(-7,-18),(12,-17),
                         (20,-3),(67,0),(76,7),(76,12)], skin, 'FFBA8F71')
            self.line(b, 'Toe detail', [(60,3),(63,10)], 'FFC09579', 1.4)
            if side == 'far':
                self.arm_art(bones, side, tint, shade, dark, skin)
        b = bones['spine']
        self.polygon(b, 'Gi jacket', [(-15,-44),(142,-48),(180,-36),(194,-10),
                     (184,33),(150,43),(-13,49)], blue, dark)
        self.polygon(b, 'Jacket wrap', [(-12,14),(130,7),(182,24),(163,42),(-12,43)], light)
        self.polygon(b, 'Lapel dark edge', [(20,23),(165,12),(187,26),(179,34),(21,34)], dark)
        self.polygon(b, 'Lapel woven face', [(23,25),(165,17),(183,28),(178,30),(23,30)], 'FF73A3D0')
        self.line(b, 'Jacket lower seam', [(18,-30),(18,38)], 'FF154679', 2)
        # Belt is drawn once on the spine, so it follows the hip/torso joint.
        self.rect(b, 'Brown belt', 12, 0, 23, 99, brown, 3, 'FF533726')
        self.polygon(b, 'Belt knot', [(0,18),(11,11),(24,21),(14,33),(1,30)], 'FF946B47', 'FF533726')
        self.polygon(b, 'Belt tail', [(10,20),(-39,29),(-42,15),(8,13)], brown, 'FF533726')
        self.line(b, 'Belt stitching', [(8,-44),(8,10)], 'FFC0966C', 1.5)
        b = bones['neck']
        self.rect(b, 'Neck', 10, 0, 32, 28, skin, 11)
        b = bones['head']
        self.polygon(b, 'Face', [(3,-14),(8,-25),(43,-31),(64,-25),(76,-9),
                     (72,19),(54,30),(39,31),(34,42),(26,34),(9,30),(1,18)], skin, 'FFBB9276')
        self.ellipse(b, 'Ear', 32,-24,22,15, skinlight, 'FFBC9478')
        self.polygon(b, 'White hair silhouette', [(32,-28),(42,-39),(55,-33),(63,-43),
                     (68,-31),(79,-33),(77,-21),(89,-14),(78,-5),(83,5),
                     (73,9),(76,29),(65,23),(63,35),(50,28),(58,14),
                     (62,-5),(45,-15),(25,-18)], 'FFF3F3F0', 'FFC3CCD4')
        self.polygon(b, 'Hair fringe', [(70,8),(68,33),(57,38),(62,18),(51,27),(57,5)], 'FFFFFFFF')
        self.ellipse(b, 'Eye white', 45,25,11,13,'FFFFFFFF')
        self.ellipse(b, 'Blue iris', 45,29,6,6,'FF4D98D1')
        self.ellipse(b, 'Pupil', 45,30,3,3,'FF172E48')
        self.line(b, 'Brow', [(52,20),(51,30)],'FF8795A2',2)
        self.line(b, 'Mouth', [(15,29),(14,35)],'FF946B55',1.7)
        self.arm_art(bones, 'near', blue, light, dark, skin)

    def arm_art(self, bones, side, blue, light, dark, skin):
        for part,length,width in [('upper_arm',105,57),('forearm',95,47)]:
            b=bones[part+'_'+side]
            self.rect(b,part+' sleeve',length/2,0,length+29,width,blue,width/2)
            self.line(b,'Sleeve seam',[(15,-width*.2),(length-13,-width*.21)],light,2.5)
            if part=='forearm':
                self.rect(b,'Wrist cuff',length-3,0,14,width-3,dark,3)
        b=bones['hand_'+side]
        self.rect(b,'Bare hand',19,0,53,28,skin,12,'FFBA8F71')
        self.ellipse(b,'Thumb',13,12,24,13,skin)
        self.line(b,'Finger crease',[(29,-9),(29,7)],'FFC39779',1.2)

    def draw_in_front(self, drawable, target):
        target_id=self.ident()
        rule=self.node(drawable,'DrawRules','Stable drawing order',drawTargetId=target_id)
        # Runtime painter order: before places this drawable visibly in front.
        add(rule,'DrawTarget',id=target_id,name='Layer anchor',drawableId=target,placementValue='before')

    def artboard(self, name, timeline, rig=False, origin_x=0):
        board=self.node(self.root,'Artboard',name,width=900,height=900,originX=0,originY=0,x=origin_x)
        style=self.node(board,'LayoutComponentStyle','Canvas style')
        board.set('styleId',style.get('id'))
        fill=self.node(board,'Fill','Background')
        self.node(fill,'SolidColor','Background paint',colorValue='FFF2F4F7')
        self.layers=[]
        self.rect(board,'Mat',450,818,800,94,'FFD8E0E9',18)
        self.line(board,'Floor line',[(50,771),(850,771)],'FFBAC7D6',2)
        self.ellipse(board,'Ground shadow',420,775,185,12,'FFC1CEDC')
        first=timeline[0]
        bones={}
        for spec in self.profile['bones']:
            n,p=spec['name'],spec['parent']
            attrs={'length':spec['length'],'rotation':first['local_rotations_rad'][n]}
            if p is None:attrs.update(x=first['root']['x'],y=first['root']['y'])
            b=self.node(board if p is None else bones[p], 'RootBone' if p is None else 'Bone',n,**attrs)
            low,high=spec['local_bounds_deg']
            self.node(b,'RotationConstraint',n+' local range',doesCopy='false',min='true',max='true',
                      minValue=low*RAD,maxValue=high*RAD,minMaxSpaceValue='local',strength=1)
            bones[n]=b
        self.art(bones)
        if rig:
            for spec in self.profile['bones']:
                b=bones[spec['name']]
                self.line(b,spec['name']+' axis',[(0,0),(spec['length'],0)],'FF00A6C7',3)
                self.ellipse(b,spec['name']+' pivot',0,0,10,10,'FF37D9F2','FF0F7287')
        for previous,current in zip(self.layers,self.layers[1:]):
            self.draw_in_front(current,previous.get('id'))
        anim=self.node(board,'LinearAnimation','Basic range demonstration',fps=self.profile['fps'],
                       duration=self.profile['duration_frames'],loopValue='oneShot')
        for spec in self.profile['bones']:
            n=spec['name']
            properties=['rotation']+(['x','y'] if n=='pelvis' else [])
            keyed=self.node(anim,'KeyedObject',n+' keys',objectId=bones[n].get('id'))
            # KeyedObject/KeyedProperty do not inherit Component.name.
            keyed.attrib.pop('name',None)
            for property_name in properties:
                prop=add(keyed,'KeyedProperty',property=property_name)
                for sample in timeline:
                    value=(sample['local_rotations_rad'][n] if property_name=='rotation'
                           else sample['root'][property_name])
                    add(prop,'KeyFrameDouble',frame=sample['frame'],value=repr(value),interpolationType='linear')
        machine=self.node(board,'StateMachine','Autoplay')
        board.set('defaultStateMachineId',machine.get('id'))
        layer=self.node(machine,'StateMachineLayer','Motion')
        state=add(layer,'AnimationState',id=self.ident(),stateName='Basic motion',animationId=anim.get('id'),x=220,y=0)
        entry=add(layer,'EntryState',id=self.ident(),x=0,y=0)
        add(entry,'StateTransition',stateToId=state.get('id'))
        add(layer,'AnyState',id=self.ident(),x=0,y=-150)
        add(layer,'ExitState',id=self.ident(),x=440,y=-150)


def main():
    profile=json.loads((HERE/'rig_profile.json').read_text())
    timeline=[pose(profile,i) for i in range(profile['duration_frames']+1)]
    ranges={b['name']:[float('inf'),float('-inf')] for b in profile['bones']}
    maximum_stance_drift=0.
    min_clearance=1e9
    for frame in timeline:
        for b in profile['bones']:
            v=frame['local_rotations_rad'][b['name']]/RAD
            low,high=b['local_bounds_deg']
            if not low-1e-8<=v<=high+1e-8:
                raise ValueError(f'{b["name"]} exceeds native limit at frame {frame["frame"]}: {v}')
            ranges[b['name']][0]=min(ranges[b['name']][0],v)
            ranges[b['name']][1]=max(ranges[b['name']][1],v)
        for side,contact in frame['contacts'].items():
            for marker in ('heel','toe'):
                min_clearance=min(min_clearance,profile['floor_y']-contact[marker][1])
                if contact['required']:
                    expected=plus(profile['stance_ankles'][side],profile['foot_markers_local'][marker])
                    maximum_stance_drift=max(maximum_stance_drift,math.dist(expected,contact[marker]))
    if min_clearance < -0.01 or maximum_stance_drift > 0.001:
        raise ValueError(f'Floor contact failure: clearance={min_clearance}, drift={maximum_stance_drift}')
    drawing=Drawing(profile)
    drawing.artboard('Clean',timeline)
    drawing.artboard('Rig',timeline,True,1000)
    OUT.mkdir(parents=True,exist_ok=True)
    ET.indent(drawing.root,space='  ')
    (OUT/'scene.rml').write_text('<?xml version="1.0" encoding="utf-8"?>\n'+ET.tostring(drawing.root,encoding='unicode')+'\n')
    (OUT/'rive.yaml').write_text('name: bjj-basic-native-rig\nmain: Clean\noutput:\n  dir: build\n')
    data={'schema_version':1,'fps':profile['fps'],'duration_frames':profile['duration_frames'],
          'interpolation':'linear','floor_y':profile['floor_y'],'frames':timeline}
    (OUT/'timeline.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    receipt={'schema_version':1,'status':'source_generated','artboards':['Clean','Rig'],
             'bones_per_artboard':len(profile['bones']),'constraints_per_artboard':len(profile['bones']),
             'fps':profile['fps'],'duration_frames':profile['duration_frames'],'duration_seconds':15,
             'units':{'angles':'radians','lengths':'artboard pixels'},'animated_properties':['rotation','pelvis.x','pelvis.y'],
             'persistent_geometry':True,'external_assets':False,'rive_scripting':False,'paid_api_calls':0,
             'limits_scope':profile['purpose'],'local_rotation_ranges_deg':ranges,
             'hierarchy':[{**b,'scale':[1,1],'bind_offset':[0,0]} for b in profile['bones']],
             'max_stance_marker_drift_px':maximum_stance_drift,'minimum_sole_clearance_px':min_clearance,
             'interpolation':'native linear between every 24fps pose; no scale/length keys',
             'runtime_verification':'not_performed_by_generator'}
    (OUT/'model-receipt.json').write_text(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps(receipt,ensure_ascii=False,indent=2))


if __name__=='__main__':
    main()
