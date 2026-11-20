#!/usr/bin/env python3
"""Deterministic 2D tripod demonstration planner; fixed-length contact IK."""
from pathlib import Path
import json,math,hashlib
HERE=Path(__file__).resolve().parent
PROFILE=json.loads((HERE/'tripod-profile.json').read_text());B={b['name']:b for b in PROFILE['bones']};D=math.pi/180

def mix(a,b,t):return a+(b-a)*t

def smooth(t):t=max(0,min(1,t));return t*t*(3-2*t)

def curve(t,points):
 for (a,x),(b,y) in zip(points,points[1:]):
  if t<=b:return mix(x,y,smooth((t-a)/(b-a)))
 return points[-1][1]

def rot(p,a):c,s=math.cos(a),math.sin(a);return [c*p[0]-s*p[1],s*p[0]+c*p[1]]
def add(a,b):return [a[0]+b[0],a[1]+b[1]]
def sub(a,b):return [a[0]-b[0],a[1]-b[1]]
def wrap(a):return (a+math.pi)%(2*math.pi)-math.pi

def bounded(n,a):
 lo,hi=B[n]['local_bounds_deg'];return lo*D-1e-8<=a<=hi*D+1e-8

def canon(n,a):
 candidates=[a+2*math.pi*k for k in range(-2,3)]
 return next((v for v in candidates if bounded(n,v)),None)

def tolocal(state,p):
 v=rot(sub(p,state['root']),-state['orientation_rad']);return [state['mirror']*v[0],v[1]]
def toworld(state,p):return add(state['root'],rot([state['mirror']*p[0],p[1]],state['orientation_rad']))
def vectorworld(state,p):return rot([state['mirror']*p[0],p[1]],state['orientation_rad'])
def fk(state):
 out={}
 for b in PROFILE['bones']:
  n,p=b['name'],b['parent'];origin=[0,0] if p is None else out[p]['tip_local'];a=state['rotations_rad'][n]+(0 if p is None else out[p]['angle_local'])
  tip=add(origin,rot([b['length'],0],a));out[n]={'origin_local':origin,'tip_local':tip,'angle_local':a,'origin':toworld(state,origin),'tip':toworld(state,tip)}
 return out

def marker(state,bone,local):
 f=fk(state)[bone];return toworld(state,add(f['origin_local'],rot(local,f['angle_local'])))

def ik2(goal,a,b,sign):
 d=math.hypot(*goal)
 if d> a+b+1e-6 or d<abs(a-b)+1e-6:return None
 q=math.acos(max(-1,min(1,(a*a+d*d-b*b)/(2*a*d))));bend=sign*(math.pi-math.acos(max(-1,min(1,(a*a+b*b-d*d)/(2*a*b)))))
 return math.atan2(goal[1],goal[0])-sign*q,bend

last={}

def leg_ankle(state,side,ankle,preferred_foot_world):
 key=state['name']+'leg'+side
 goal=tolocal(state,ankle);q=ik2(goal,155,155,1)
 if not q:raise ValueError('unreachable '+key+' '+str(goal))
 a=canon('thigh_'+side,q[0]);b=q[1]
 if a is None or not bounded('shin_'+side,b):raise ValueError('leg range '+key+' '+str([q[0]/D,b/D]))
 options=[]
 for phi_deg in range(130,321):
  phi=phi_deg*D;alpha=(state['orientation_rad']+math.pi-phi if state['mirror']==-1 else phi-state['orientation_rad']);foot=canon('foot_'+side,alpha-a-b)
  if foot is None:continue
  cost=wrap(phi-preferred_foot_world)**2+0.5*wrap(phi-last.get(key,phi))**2
  options.append((cost,foot,phi))
 if not options:raise ValueError('foot range '+key)
 _,foot,phi=min(options);last[key]=phi
 state['rotations_rad'].update({'thigh_'+side:a,'shin_'+side:b,'foot_'+side:foot})

def leg_contact(state,side,target,local,preferred_phi):
 key=state['name']+'contactleg'+side;options=[]
 for phi_deg in range(-160,1):
  phi=phi_deg*D;alpha=phi-state['orientation_rad'];offset=vectorworld(state,rot(local,alpha));ankle=sub(target,offset)
  q=ik2(tolocal(state,ankle),155,155,1)
  if not q:continue
  a=canon('thigh_'+side,q[0]);b=q[1]
  if a is None or not bounded('shin_'+side,b):continue
  foot=canon('foot_'+side,alpha-a-b)
  if foot is None:continue
  cost=wrap(phi-preferred_phi)**2 + 2*wrap(phi-last.get(key,phi))**2
  options.append((cost,a,b,foot,phi))
 if not options:raise ValueError('contact leg no pose '+key+' target'+str(target)+' root'+str(state['root']))
 _,a,b,foot,phi=min(options);last[key]=phi
 state['rotations_rad'].update({'thigh_'+side:a,'shin_'+side:b,'foot_'+side:foot})

def hand_contact(state,side,target,local,pref_phi):
 key=state['name']+'hand'+side;spine=state['rotations_rad']['spine'];shoulder=rot([190,0],spine);options=[]
 for phi_step in range(-120,181):
  phi=phi_step*.5*D;alpha=phi-state['orientation_rad'];wrist=sub(tolocal(state,target),rot(local,alpha));q=ik2(sub(wrist,shoulder),105,95,-1)
  if not q:continue
  upper=canon('upper_arm_'+side,q[0]-spine);elbow=q[1];hand=canon('hand_'+side,alpha-q[0]-elbow)
  if upper is None or hand is None or not bounded('forearm_'+side,elbow):continue
  previous=last.get(key,phi);cost=.15*wrap(phi-pref_phi)**2+4*wrap(phi-previous)**2
  options.append((cost,upper,elbow,hand,phi))
 if not options:raise ValueError('contact hand no pose '+key+' target'+str(target)+' shoulder'+str(toworld(state,shoulder)))
 _,u,e,h,phi=min(options);last[key]=phi
 state['rotations_rad'].update({'upper_arm_'+side:u,'forearm_'+side:e,'hand_'+side:h})

def state(name,root,orientation,spine):
 r={b['name']:b['bind_local_rotation_deg']*D for b in PROFILE['bones']};r.update(pelvis=0,spine=spine*D,neck=0,head=0)
 return {'name':name,'root':root,'orientation_rad':orientation*D,'mirror':-1 if name=='white' else 1,'rotations_rad':r}

frames=[];release_pose=None;max_error=0;max_step=0;peaks={n:[999,-999] for n in B};all_contacts=[]
for f in range(289):
 t=f/24
 phase='setup' if t<2 else 'load' if t<3 else 'push_pull' if t<5 else 'controlled_fall' if t<7.5 else 'follow' if t<10 else 'result_hold'
 wroot=[curve(t,[(0,760),(2,760),(3,750),(5,808),(7.5,900),(12,900)]),curve(t,[(0,575),(2,575),(3,580),(5,596),(7.5,795),(12,795)])]
 wr=curve(t,[(0,0),(3,0),(5,8),(7.5,90),(12,90)])
 ws=curve(t,[(0,-70),(3,-65),(5,-80),(7.5,-90),(12,-90)])
 white=state('white',wroot,wr,ws)
 blue=state('blue',[curve(t,[(0,570),(2,570),(3,575),(5,570),(8.5,590),(12,590)]),810],-90,curve(t,[(0,-70),(2,-70),(3,-72),(5,-65),(8.5,-55),(12,-55)]))
 blue['rotations_rad']['neck']=12*D
 nearankle=[curve(t,[(0,600),(3,600),(5,590),(8.5,620),(12,620)]),curve(t,[(0,838),(3,838),(5,815),(8.5,790),(12,790)])]
 farankle=[curve(t,[(0,840),(3,840),(5,825),(7.5,750),(8.5,820),(12,820)]),curve(t,[(0,838),(3,838),(5,820),(7.5,755),(8.5,730),(12,730)])]
 leg_ankle(white,'near',nearankle,curve(t,[(0,180),(3,180),(5,205),(7.5,260),(12,260)])*D)
 leg_ankle(white,'far',farankle,curve(t,[(0,180),(3,180),(5,205),(7.5,270),(8.5,240),(12,240)])*D)
 # Open arms balance, then tuck elbows and keep hands above the mat on landing.
 for side,u,e in [('near',150,-40),('far',130,-60)]:
  white['rotations_rad']['upper_arm_'+side]=curve(t,[(0,u),(3,u),(5,140 if side=='near' else 120),(7.5,120 if side=='near' else 105),(12,120 if side=='near' else 105)])*D
  white['rotations_rad']['forearm_'+side]=curve(t,[(0,e),(5,e),(7.5,-100),(12,-100)])*D
  white['rotations_rad']['hand_'+side]=0
 # One actual ankle control only. The other arm stays folded/free.
 grip_local=[36,0];grip=marker(white,'foot_near',[0,-6]);hand_contact(blue,'near',grip,grip_local,20*D)
 blue['rotations_rad'].update(upper_arm_far=190*D,forearm_far=-130*D,hand_far=0)
 contacts=[{'name':'ankle_grip','a':{'character':'blue','bone':'hand_near','local':grip_local},'b':{'character':'white','bone':'foot_near','local':[0,-6]},'active':True}]
 if t<=5.25:
  hip_local=[-3,32];hip=marker(white,'spine',hip_local)
  hook_local=[113,22];hook=marker(white,'shin_far',hook_local)
  leg_contact(blue,'near',hip,[20,12],-105*D);leg_contact(blue,'far',hook,[24,-8],-90*D)
  contacts += [{'name':'hip_sole','a':{'character':'blue','bone':'foot_near','local':[20,12]},'b':{'character':'white','bone':'spine','local':hip_local},'active':True},{'name':'far_leg_hook','a':{'character':'blue','bone':'foot_far','local':[24,-8]},'b':{'character':'white','bone':'shin_far','local':hook_local},'active':True}]
  release_pose={n:blue['rotations_rad'][n] for n in ['thigh_near','shin_near','foot_near','thigh_far','shin_far','foot_far']}
 else:
  progress=smooth((t-5.25)/1.5)
  target={'thigh_near':-20,'shin_near':125,'foot_near':-100,'thigh_far':-10,'shin_far':100,'foot_far':-100}
  for n,v in target.items():blue['rotations_rad'][n]=mix(release_pose[n],v*D,progress)
 for who in [blue,white]:
  for n,a in who['rotations_rad'].items():
   if not bounded(n,a):raise ValueError('range frame'+str(f)+' '+who['name']+' '+n+' '+str(a/D))
   peaks[n][0]=min(peaks[n][0],a/D);peaks[n][1]=max(peaks[n][1],a/D)
 for contact in contacts:
  states={'blue':blue,'white':white};a=contact['a'];b=contact['b'];pa=marker(states[a['character']],a['bone'],a['local']);pb=marker(states[b['character']],b['bone'],b['local']);error=math.dist(pa,pb);max_error=max(max_error,error);contact.update(point_a=pa,point_b=pb,error_px=error)
 clean=lambda s:{k:s[k] for k in ['root','orientation_rad','rotations_rad']}
 frames.append({'frame':f,'phase':phase,'characters':{'white':clean(white),'blue':clean(blue)},'contacts':contacts})
 if f:
  for c in ['blue','white']:
   for n in B:max_step=max(max_step,abs(frames[-1]['characters'][c]['rotations_rad'][n]-frames[-2]['characters'][c]['rotations_rad'][n]))
plan={'schema_version':1,'width':1600,'height':950,'floor_y':850,'fps':24,'duration_frames':288,'profile_file':str((HERE/'tripod-profile.json').resolve()),'bind_timeline_file':str((HERE.parent/'task-064/project/timeline.json').resolve()),'characters':{'white':{'assets_manifest':str((HERE/'white-tripod-skin/project/skin-assets.json').resolve()),'mirror':-1,'rig_color':'FFFFB468'},'blue':{'assets_manifest':str((HERE/'blue-character/project/skin-assets.json').resolve()),'mirror':1,'rig_color':'FF27D7EA'}},'frames':frames}
(HERE/'tripod-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n')
(HERE/'motion-plan-receipt.json').write_text(json.dumps({'source_generated':True,'frames':289,'fps':24,'seconds':12,'max_active_contact_error_px':max_error,'max_adjacent_joint_step_deg':max_step/D,'joint_ranges_deg':peaks,'contact_release_seconds':5.25,'ankle_grip_active_throughout':True,'native_verified':False,'visual_verified':False,'user_quality':'pending'},indent=2)+'\n')
print('generated',len(frames),'frames/contact max',max_error,'joint step deg',max_step/D)
