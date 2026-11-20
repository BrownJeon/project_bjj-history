#!/usr/bin/env python3
"""Independent matrix FK/contact audit of task065; no planner imports/edits.

This checks animation geometry, not physics, medical ranges, technique validity
or naturalness. Native raster evidence and plan FK are reported separately.
Only the requested JSON report is written. PNG decoding uses the standard
library for the existing noninterlaced 8-bit RGB/RGBA artifacts.
"""
import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import xml.etree.ElementTree as ET
import zlib

HERE = Path(__file__).resolve().parent
DEFAULT_REPORT = Path('/Users/brownjeon/.codex/artifacts/bjj-t065/kinematics-verification.json')
LENGTH_TOL = ANGLE_TOL = 1e-6
CONTACT_TOL = 1.5
RELEASE = 5.25


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def compose(a, b):
    # 2x3 affine matrices, row-major linear terms followed by translation.
    aa, ab, ac, ad, ax, ay = a
    ba, bb, bc, bd, bx, by = b
    return (aa*ba+ab*bc, aa*bb+ab*bd, ac*ba+ad*bc, ac*bb+ad*bd,
            aa*bx+ab*by+ax, ac*bx+ad*by+ay)


def rotation(angle, x=0, y=0):
    c, s = math.cos(angle), math.sin(angle)
    return (c, -s, s, c, x, y)


def apply(matrix, point):
    a,b,c,d,x,y = matrix
    return [a*point[0]+b*point[1]+x, c*point[0]+d*point[1]+y]


def matrix_fk(profile, state, mirror):
    root = compose(rotation(state['orientation_rad'], *state['root']),
                   (mirror,0,0,1,0,0))
    result = {}
    for spec in profile['bones']:
        name, parent = spec['name'], spec['parent']
        base = root if parent is None else compose(
            result[parent]['matrix'], (1,0,0,1,result[parent]['length'],0))
        matrix = compose(base, rotation(state['rotations_rad'][name]))
        result[name] = {'matrix': matrix, 'origin': apply(matrix,[0,0]),
                        'tip': apply(matrix,[spec['length'],0]), 'length': spec['length']}
    return result


def interpolate(a, b, t):
    mix = lambda x,y: x+(y-x)*t
    return {'root':[mix(x,y) for x,y in zip(a['root'],b['root'])],
            'orientation_rad':mix(a['orientation_rad'],b['orientation_rad']),
            'rotations_rad':{name:mix(value,b['rotations_rad'][name])
                             for name,value in a['rotations_rad'].items()}}


def read_png(path):
    raw = path.read_bytes()
    if raw[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Not PNG: '+str(path))
    offset, payload, header = 8, bytearray(), None
    while offset < len(raw):
        size = struct.unpack('>I',raw[offset:offset+4])[0]
        kind, data = raw[offset+4:offset+8], raw[offset+8:offset+8+size]
        if kind == b'IHDR': header = struct.unpack('>IIBBBBB',data)
        if kind == b'IDAT': payload.extend(data)
        offset += size+12
        if kind == b'IEND': break
    width,height,depth,color,compression,filtering,interlace = header
    if depth != 8 or color not in (2,6) or interlace != 0:
        raise ValueError('Only noninterlaced 8-bit RGB/RGBA PNG supported')
    channels = 4 if color == 6 else 3
    scan = zlib.decompress(payload);stride=width*channels
    if len(scan)!=(stride+1)*height: raise ValueError('Unexpected PNG scan size')
    rows=[]; previous=bytearray(stride)
    for row in range(height):
        start=row*(stride+1);kind=scan[start];current=bytearray(scan[start+1:start+1+stride])
        if kind not in range(5):raise ValueError('Unknown PNG filter')
        for i in range(stride):
            left=current[i-channels] if i>=channels else 0
            above=previous[i];upperleft=previous[i-channels] if i>=channels else 0
            if kind==1:predictor=left
            elif kind==2:predictor=above
            elif kind==3:predictor=(left+above)//2
            elif kind==4:
                p=left+above-upperleft
                distances=(abs(p-left),abs(p-above),abs(p-upperleft))
                predictor=(left,above,upperleft)[distances.index(min(distances))]
            else:predictor=0
            current[i]=(current[i]+predictor)&255
        rows.append(bytes(current));previous=current
    return width,height,channels,b''.join(rows)


def hull(points):
    points=sorted(set(points))
    def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
    parts=[]
    for sequence in (points,list(reversed(points))):
        part=[]
        for p in sequence:
            while len(part)>=2 and cross(part[-2],part[-1],p)<=0:part.pop()
            part.append(p)
        parts.append(part[:-1])
    return parts[0]+parts[1]


def opaque_uv_hull(path):
    width,height,channels,pixels=read_png(path)
    points=[]
    for y in range(height):
        visible=[x for x in range(width) if channels==3 or pixels[(y*width+x)*channels+3]>=128]
        if visible:
            lo,hi=min(visible),max(visible)+1
            points.extend([(lo/width,y/height),(hi/width,y/height),
                           (lo/width,(y+1)/height),(hi/width,(y+1)/height)])
    if not points:raise ValueError('Empty opaque image')
    return hull(points)


def uv_rest(layer, point):
    u,v=point;vertices=layer['vertices']
    for triangle in layer['triangles']:
        a,b,c=[vertices[i] for i in triangle]
        den=(b['v']-c['v'])*(a['u']-c['u'])+(c['u']-b['u'])*(a['v']-c['v'])
        if abs(den)<1e-14:continue
        wa=((b['v']-c['v'])*(u-c['u'])+(c['u']-b['u'])*(v-c['v']))/den
        wb=((c['v']-a['v'])*(u-c['u'])+(a['u']-c['u'])*(v-c['v']))/den
        wc=1-wa-wb
        if min(wa,wb,wc)>=-1e-8:
            return [sum(w*q[key] for w,q in zip((wa,wb,wc),(a,b,c))) for key in ('x','y')]
    raise ValueError('Opaque UV lies outside mesh')


def rigid_alpha_shapes(plan):
    bind=json.loads(Path(plan['bind_timeline_file']).read_text())['frames'][0]['bones']
    result=[]
    for character,spec in plan['characters'].items():
        manifest_path=Path(spec['assets_manifest'])
        manifest=json.loads(manifest_path.read_text())
        for layer in manifest['layers']:
            if layer['name'] not in ('foot-near','foot-far','head-face-hair','hand-near'):continue
            bone=('head' if layer['name']=='head-face-hair' else layer['name'].replace('-','_'))
            if any({k for k,v in vertex['weights'].items() if v>0}!={bone} for vertex in layer['vertices']):
                raise ValueError('Rigid alpha audit cannot assume multi-bone layer '+layer['name'])
            rest=bind[bone];angle=rest['world_rotation_rad'];c,s=math.cos(angle),math.sin(angle)
            points=[]
            for uv in opaque_uv_hull(manifest_path.parent/layer['file']):
                x,y=uv_rest(layer,uv);dx,dy=x-rest['origin'][0],y-rest['origin'][1]
                points.append([c*dx+s*dy,-s*dx+c*dy])
            result.append({'character':character,'layer':layer['name'],'bone':bone,'points':points,
                           'image_sha256':sha((manifest_path.parent/layer['file']).read_bytes())})
    return result


def rml_audit(path, plan, profile):
    if not path.is_file():return {'status':'not_available'}
    raw=path.read_bytes();tree=ET.fromstring(raw);errors=[];counts=[];corrective=0
    expected={b['name']:b for b in profile['bones']}
    for board in tree.findall('Artboard'):
        parents={child:parent for parent in board.iter() for child in parent}
        objects={obj.get('id'):obj for obj in board.iter() if obj.get('id')}
        bones=[obj for obj in board.iter() if obj.tag in ('RootBone','Bone')]
        if len(bones)!=32:errors.append(board.get('name')+' bone count')
        for bone in bones:
            character,name=bone.get('name').split(':',1);spec=expected[name]
            parent=parents[bone]
            actual_parent=parent.get('name')
            expected_parent=character+':'+(spec['parent'] or 'CharacterTransform')
            if actual_parent!=expected_parent:errors.append('parent '+bone.get('name'))
            if abs(float(bone.get('length'))-spec['length'])>LENGTH_TOL:errors.append('length '+bone.get('name'))
            if any(abs(float(bone.get(k,'1'))-1)>1e-12 for k in ('scaleX','scaleY')):errors.append('scale '+bone.get('name'))
            if spec['parent'] is None and any(abs(float(bone.get(k,'0')))>1e-12 for k in ('x','y','rotation')):errors.append('nonzero local pelvis '+bone.get('name'))
            limits=bone.findall('RotationConstraint')
            if len(limits)!=1:errors.append('constraint count '+bone.get('name'));continue
            limit=limits[0]
            if any(limit.get(k)!=v for k,v in [('doesCopy','false'),('min','true'),('max','true'),('minMaxSpaceValue','local')]):errors.append('constraint flags '+bone.get('name'))
            if abs(float(limit.get('strength','1'))-1)>ANGLE_TOL:errors.append('constraint strength '+bone.get('name'))
            for field,value in zip(('minValue','maxValue'),spec['local_bounds_deg']):
                if abs(float(limit.get(field))-math.radians(value))>ANGLE_TOL:errors.append('constraint bounds '+bone.get('name'))
        for character,spec in plan['characters'].items():
            transform=next((obj for obj in board.iter('Node') if obj.get('name')==character+':CharacterTransform'),None)
            if transform is None:errors.append('missing CharacterTransform '+character);continue
            if float(transform.get('scaleX','1'))!=spec['mirror'] or float(transform.get('scaleY','1'))!=1:errors.append('mirror '+character)
        key_count=0
        keyed_fields=set()
        for keyed in board.iter('KeyedObject'):
            obj=objects[keyed.get('objectId')]
            for prop in keyed.findall('KeyedProperty'):
                field=prop.get('property')
                keys=prop.findall('KeyFrameDouble')
                if obj.tag in ('MeshVertex','ContourMeshVertex'):
                    corrective+=len(keys)
                    if field not in ('x','y'):errors.append('unexpected mesh corrective property')
                    ancestor=parents.get(obj)
                    while ancestor is not None and ancestor.tag!='Image':ancestor=parents.get(ancestor)
                    material=ancestor.get('name','').split(':')[-1] if ancestor is not None else ''
                    if material not in ('jacket-belt','leg-near','leg-far','sleeve-near','sleeve-far'):errors.append('non-cloth mesh corrective '+material)
                    continue
                character,name=obj.get('name').split(':',1)
                identity=(character,name,field)
                if identity in keyed_fields:errors.append('duplicate keyed rig property')
                keyed_fields.add(identity)
                if (obj.tag in ('Bone','RootBone') and field!='rotation') or (obj.tag=='Node' and field not in ('x','y','rotation')):errors.append('unexpected keyed rig property')
                if len(keys)!=len(plan['frames']):errors.append('missing rig keys '+obj.get('name'))
                for key in keys:
                    frame=int(key.get('frame'));state=plan['frames'][frame]['characters'][character]
                    value=(state['rotations_rad'][name] if name!='CharacterTransform' else
                           state['orientation_rad'] if field=='rotation' else state['root'][0 if field=='x' else 1])
                    if abs(float(key.get('value'))-value)>1e-6:errors.append('rig key mismatch '+obj.get('name'))
                    if key.get('interpolationType')!='linear':errors.append('nonlinear rig key')
                    key_count+=1
        if key_count!=38*len(plan['frames']):errors.append('rig key total '+board.get('name'))
        required_fields={(c,n,'rotation') for c in plan['characters'] for n in expected}
        required_fields|={(c,'CharacterTransform',prop) for c in plan['characters'] for prop in ('x','y','rotation')}
        if keyed_fields!=required_fields:errors.append('missing or extra keyed rig fields')
        counts.append({'artboard':board.get('name'),'bones':len(bones),'rig_keys':key_count})
    return {'status':'pass' if not errors else 'fail','scene_sha256':sha(raw),
            'errors':errors[:100],'error_count':len(errors),'artboards':counts,
            'mesh_corrective_xy_keys_reported_separately':corrective,
            'mesh_corrective_geometry_effect':'not assessed by skeletal FK'}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--plan',type=Path,default=HERE/'tripod-plan.json')
    parser.add_argument('--profile',type=Path,default=HERE/'tripod-profile.json')
    parser.add_argument('--rml',type=Path,default=HERE/'project/scene.rml')
    parser.add_argument('--output',type=Path,default=DEFAULT_REPORT)
    parser.add_argument('--subdivisions',type=int,default=8)
    parser.add_argument('--skip-rml',action='store_true',help='Explicitly defer source comparison while writer is updating it')
    parser.add_argument('--overlay',type=Path)
    parser.add_argument('--overlay-time',type=float,default=10.5)
    parser.add_argument('--overlay-character',choices=('blue','white','all'),default='blue')
    args=parser.parse_args()
    if args.subdivisions<2:raise ValueError('At least two subdivisions required')
    raw_plan=args.plan.read_bytes();raw_profile=args.profile.read_bytes()
    plan=json.loads(raw_plan);profile=json.loads(raw_profile);specs={b['name']:b for b in profile['bones']}
    failures=[]
    def issue(kind,**details):
        if len(failures)<200:failures.append({'kind':kind,**details})
    if len(specs)!=16 or len(plan['frames'])!=289 or plan['fps']!=24:issue('input_contract')
    if profile.get('scale',[1,1])!=[1,1] or profile.get('bind_offset',[0,0])!=[0,0]:issue('geometry_profile_scale_or_offset')
    baseline_path=Path(plan['bind_timeline_file']).parent.parent/'rig_profile.json'
    raw_baseline=baseline_path.read_bytes();baseline=json.loads(raw_baseline)
    original={b['name']:b for b in baseline['bones']}
    if set(original)!=set(specs):issue('original_bone_names_changed')
    for index,bone in enumerate(profile['bones']):
        if bone['name'] not in original or any(bone[k]!=original[bone['name']][k] for k in ('parent','length')):issue('original_bone_geometry_changed',bone=bone['name'])
        if bone.get('scale',[1,1])!=[1,1] or bone.get('bind_offset',[0,0])!=[0,0]:issue('bone_scale_or_offset',bone=bone['name'])
        if bone['parent'] is not None and bone['parent'] not in {b['name'] for b in profile['bones'][:index]}:issue('hierarchy_not_topological',bone=bone['name'])
    for c,m in [('white',-1),('blue',1)]:
        if plan['characters'][c]['mirror']!=m:issue('mirror',character=c)
    definitions={contact['name']:{key:contact[key] for key in ('a','b')} for contact in plan['frames'][0]['contacts']}
    expected_contacts={'ankle_grip','hip_sole','far_leg_hook'}
    if set(definitions)!=expected_contacts:issue('initial_triple_contact_definitions')
    maxima={'length_error_px':0.,'hierarchy_origin_error_px':0.,'local_limit_excess_rad':0.,'mirrored_bend_error_rad':0.,'metadata_world_point_error_px':0.,'metadata_contact_error_error_px':0.}
    contact_stats={name:{'keyframe_max_px':0.,'interpolated_max_px':0.,'worst_sample_frame':0.} for name in definitions}
    ranges={c:{n:[math.inf,-math.inf] for n in specs} for c in plan['characters']}
    floor=plan['floor_y'];alpha_shapes=rigid_alpha_shapes(plan)
    alpha_stats={s['character']+'/'+s['layer']:{'max_y':-math.inf,'max_penetration_px':0.,'worst_sample_frame':0.,'last_frame_max_y':None,'image_sha256':s['image_sha256']} for s in alpha_shapes}
    sole_stats={c+'/'+side:{'max_y':-math.inf,'max_penetration_px':0.,'worst_sample_frame':0.} for c in plan['characters'] for side in ('near','far')}
    initial_white={};ankles={side:[] for side in ('near','far')};max_endpoint={'y':-math.inf}
    max_delta=0.;states_at_overlay=None
    for index in range(plan['duration_frames']*args.subdivisions+1):
        frame_value=index/args.subdivisions;left=min(int(frame_value),plan['duration_frames']);fraction=frame_value-left
        right=min(left+1,plan['duration_frames']);time_seconds=frame_value/plan['fps'];is_key=fraction==0
        states={c:interpolate(plan['frames'][left]['characters'][c],plan['frames'][right]['characters'][c],fraction) for c in plan['characters']}
        poses={c:matrix_fk(profile,state,plan['characters'][c]['mirror']) for c,state in states.items()}
        for c,state in states.items():
            mirror=plan['characters'][c]['mirror']
            if set(state['rotations_rad'])!=set(specs):issue('rotation_names',character=c)
            for n,bone in poses[c].items():
                spec=specs[n];value=state['rotations_rad'][n];lo,hi=map(math.radians,spec['local_bounds_deg'])
                excess=max(0.,lo-value,value-hi);maxima['local_limit_excess_rad']=max(maxima['local_limit_excess_rad'],excess)
                if excess>ANGLE_TOL:issue('angle_limit',character=c,bone=n,frame=frame_value,excess_rad=excess)
                ranges[c][n][0]=min(ranges[c][n][0],math.degrees(value));ranges[c][n][1]=max(ranges[c][n][1],math.degrees(value))
                err=abs(math.dist(bone['origin'],bone['tip'])-spec['length']);maxima['length_error_px']=max(maxima['length_error_px'],err)
                if err>LENGTH_TOL:issue('bone_length',character=c,bone=n,frame=frame_value,error_px=err)
                if spec['parent'] is not None:
                    parent=poses[c][spec['parent']]
                    err=math.dist(bone['origin'],parent['tip']);maxima['hierarchy_origin_error_px']=max(maxima['hierarchy_origin_error_px'],err)
                    if err>LENGTH_TOL:issue('parent_tip',character=c,bone=n,frame=frame_value,error_px=err)
                    if n.startswith(('forearm_','shin_')):
                        a=parent['matrix'];b=bone['matrix']
                        turn=math.atan2(a[0]*b[2]-a[2]*b[0],a[0]*b[0]+a[2]*b[2])*mirror
                        err=abs(turn-value);maxima['mirrored_bend_error_rad']=max(maxima['mirrored_bend_error_rad'],err)
                        if err>ANGLE_TOL:issue('mirrored_bend',character=c,bone=n,frame=frame_value)
                        if (n.startswith('forearm_') and turn>ANGLE_TOL) or (n.startswith('shin_') and turn<-ANGLE_TOL):issue('reversed_bend',character=c,bone=n,frame=frame_value)
                for label in ('origin','tip'):
                    if bone[label][1]>max_endpoint['y']:max_endpoint={'y':bone[label][1],'character':c,'bone':n,'marker':label,'frame':frame_value}
            for side in ('near','far'):
                bone=poses[c]['foot_'+side];key=c+'/'+side
                for label,local in profile['foot_markers_local'].items():
                    p=apply(bone['matrix'],local)
                    if p[1]>sole_stats[key]['max_y']:sole_stats[key].update(max_y=p[1],max_penetration_px=max(0.,p[1]-floor),worst_sample_frame=frame_value,marker=label)
                    if index==0 and c=='white':initial_white[side+'/'+label]={'point':p,'floor_error_px':abs(p[1]-floor)}
                if is_key and c=='white':ankles[side].append((frame_value,bone['origin']))
        for shape in alpha_shapes:
            key=shape['character']+'/'+shape['layer'];m=poses[shape['character']][shape['bone']]['matrix']
            y=max(apply(m,p)[1] for p in shape['points'])
            if y>alpha_stats[key]['max_y']:alpha_stats[key].update(max_y=y,max_penetration_px=max(0.,y-floor),worst_sample_frame=frame_value)
            if index==plan['duration_frames']*args.subdivisions:alpha_stats[key]['last_frame_max_y']=y
        for name,definition in definitions.items():
            active=name=='ankle_grip' or time_seconds<=RELEASE
            if not active:continue
            a,b=definition['a'],definition['b'];pa=apply(poses[a['character']][a['bone']]['matrix'],a['local']);pb=apply(poses[b['character']][b['bone']]['matrix'],b['local']);error=math.dist(pa,pb)
            field='keyframe_max_px' if is_key else 'interpolated_max_px'
            if error>max(contact_stats[name]['keyframe_max_px'],contact_stats[name]['interpolated_max_px']):contact_stats[name]['worst_sample_frame']=frame_value
            if error>contact_stats[name][field]:
                contact_stats[name][field]=error
                contact_stats[name]['keyframe_worst_frame' if is_key else 'interpolated_worst_frame']=frame_value
            if error>CONTACT_TOL:issue('contact',name=name,frame=frame_value,interpolated=not is_key,error_px=error)
        if is_key:
            frame=plan['frames'][left];found={d['name']:d for d in frame['contacts']}
            for name in expected_contacts:
                should=name=='ankle_grip' or time_seconds<=RELEASE
                active=found.get(name,{}).get('active',False)
                if active!=should:issue('contact_schedule',name=name,frame=left,actual=active,expected=should)
            for name,contact in found.items():
                if name not in definitions:issue('unknown_contact',frame=left,name=name);continue
                if any(contact[key]!=definitions[name][key] for key in ('a','b')):issue('contact_marker_changed',frame=left,name=name)
                points=[]
                for label in ('a','b'):
                    marker=contact[label];point=apply(poses[marker['character']][marker['bone']]['matrix'],marker['local']);points.append(point)
                    err=math.dist(point,contact['point_'+label]);maxima['metadata_world_point_error_px']=max(maxima['metadata_world_point_error_px'],err)
                    if err>LENGTH_TOL:issue('metadata_marker_point',frame=left,name=name,marker=label,error_px=err)
                err=abs(math.dist(*points)-contact['error_px']);maxima['metadata_contact_error_error_px']=max(maxima['metadata_contact_error_error_px'],err)
                if err>LENGTH_TOL:issue('metadata_contact_error',frame=left,name=name,error_px=err)
    for c in plan['characters']:
        for a,b in zip(plan['frames'],plan['frames'][1:]):
            for n in specs:max_delta=max(max_delta,abs(b['characters'][c]['rotations_rad'][n]-a['characters'][c]['rotations_rad'][n]))
    white_travel={}
    for side,points in ankles.items():
        origin=points[0][1];post=[p for f,p in points if f>RELEASE*plan['fps']]
        travel=max(math.dist(origin,p) for _,p in points)
        released=max(math.dist(post[0],p) for p in post)
        white_travel[side]={'max_from_initial_px':travel,'final_from_initial_px':math.dist(origin,points[-1][1]),'post_release_travel_px':released}
        if travel<=LENGTH_TOL or released<=LENGTH_TOL:issue('white_ankle_world_fixed',side=side)
    for name,value in initial_white.items():
        if value['floor_error_px']>LENGTH_TOL:issue('initial_white_sole_not_floor',marker=name,error_px=value['floor_error_px'])
    overlay={'status':'not_requested'}
    if args.overlay:
        width,height,channels,pixels=read_png(args.overlay)
        frame_value=min(args.overlay_time*plan['fps'],plan['duration_frames']);left=int(frame_value);right=min(left+1,plan['duration_frames'])
        character_results={}
        selected=list(plan['characters']) if args.overlay_character=='all' else [args.overlay_character]
        for c in selected:
            state=interpolate(plan['frames'][left]['characters'][c],plan['frames'][right]['characters'][c],frame_value-left)
            overlay_pose=matrix_fk(profile,state,plan['characters'][c]['mirror']);tint=plan['characters'][c]['rig_color'];rgb=[int(tint[i:i+2],16) for i in (2,4,6)]
            points={tuple(pose[label]) for pose in overlay_pose.values() for label in ('origin','tip')}
            distances=[]
            for x,y in points:
                nearest=math.inf
                for py in range(max(0,int(y)-12),min(height,int(y)+13)):
                    for px in range(max(0,int(x)-12),min(width,int(x)+13)):
                        base=(py*width+px)*channels
                        if max(abs(pixels[base+i]-rgb[i]) for i in range(3))<=12:
                            nearest=min(nearest,math.hypot(px+.5-x,py+.5-y))
                distances.append({'expected':[x,y],'nearest_color_distance_px':None if math.isinf(nearest) else nearest})
            character_results[c]={'points':distances,'unmatched_points':sum(d['nearest_color_distance_px'] is None for d in distances),
                                  'max_matched_distance_px':max((d['nearest_color_distance_px'] for d in distances if d['nearest_color_distance_px'] is not None),default=None)}
        overlay={'status':'sampled','characters':character_results,'time_seconds':args.overlay_time,'viewport':[width,height],
                 'expected_artboard':[plan['width'],plan['height']],'resize_or_fit_correction_applied':False,
                 'color_tolerance_per_channel':12,
                 'scope':'Nearby cyan/orange raster support, not extraction of native numeric bone transforms',
                 'png_sha256':sha(args.overlay.read_bytes())}
    native=({'status':'explicitly_deferred_pending_updated_source'} if args.skip_rml else rml_audit(args.rml,plan,profile))
    if native.get('status')=='fail':issue('rml_source_mismatch',count=native['error_count'])
    changed=sha(args.plan.read_bytes())!=sha(raw_plan) or sha(args.profile.read_bytes())!=sha(raw_profile)
    if changed:issue('inputs_changed_during_verification')
    observations=[{'kind':'opaque_rigid_layer_ground_intersection','shape':name,**stat} for name,stat in alpha_stats.items() if stat['max_penetration_px']>LENGTH_TOL]
    report={'schema_version':1,'status':'fail' if failures else ('pass' if native['status']=='pass' else 'partial_pass'),
            'plan_sha256':sha(raw_plan),'profile_sha256':sha(raw_profile),
            'original_profile_sha256':sha(raw_baseline),
            'tolerances':{'length_px':LENGTH_TOL,'angle_radians':ANGLE_TOL,'active_contact_px':CONTACT_TOL},
            'independent_fk':'2x3 affine matrix composition; root orientation * mirror * parent-tip * local rotation; no planner import',
            'sampled_keyframes':len(plan['frames']),'interpolation_subdivisions':args.subdivisions,
            'total_samples':plan['duration_frames']*args.subdivisions+1,'bone_instances_per_sample':32,
            'interpolation':'Native linear on root x/y, orientation and local bone rotations; constant mirror',
            'maxima':maxima,'contacts':contact_stats,'contact_release_seconds':RELEASE,
            'contact_schedule':'ankle_grip throughout; hip_sole/far_leg_hook only through 5.25 seconds',
            'local_joint_ranges_deg':ranges,'max_adjacent_local_rotation_step_deg':math.degrees(max_delta),
            'initial_white_soles':initial_white,'white_ankle_motion':white_travel,
            'rig_sole_markers':sole_stats,'max_skeleton_endpoint_y':max_endpoint,
            'last_skeletal_head_points':{c:{label:poses[c]['head'][label] for label in ('origin','tip')} for c in plan['characters']},
            'opaque_rigid_layer_ground':alpha_stats,
            'alpha_ground_method':'alpha>=128 pixel-support convex hull mapped through mesh UV and original global bind; rigid foot/head/hand-near layers only; cloth pose-correctives excluded; raster filtering can shift edge about one source pixel',
            'ground_observations':observations,'rml_source':native,'native_overlay_raster':overlay,
            'failures':failures,'failure_count_reported':len(failures),
            'scope_limits':['No physics/medical/technique/naturalness approval','No cloth-alpha ground verdict','Native clamp numerical behavior is separate from plan FK'],
            'source_or_profile_modified':False,'installation_or_model_inference':False}
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps(report,ensure_ascii=False,indent=2,allow_nan=False)+'\n')
    overlay_summary={k:v for k,v in overlay.items() if k!='characters'}
    if 'characters' in overlay:
        overlay_summary['characters']={c:{k:v for k,v in entry.items() if k!='points'} for c,entry in overlay['characters'].items()}
    print(json.dumps({'status':report['status'],'report':str(args.output),'maxima':maxima,'contacts':contact_stats,
                      'ground_observations':observations,'rml_status':native['status'],'native_overlay':overlay_summary,'failures':failures[:20]},ensure_ascii=False,indent=2,allow_nan=False))
    return 1 if failures else 0


if __name__=='__main__':
    raise SystemExit(main())
