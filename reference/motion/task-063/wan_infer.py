"""Task-only low-memory/offline adapter around the pinned Wan MLX runtime.

Preserves native BF16 T5 weights (attention softmax is still upstream FP32),
caches checked text contexts in a separate process, and uses the supplied local
tokenizer. Upstream source and system memory limits are never changed.
"""
from pathlib import Path
import argparse,gc,hashlib,json,os,subprocess,time,traceback

ROOT=Path.home()/'.local/share/bjj-rive/task-063/wan-local'
MODEL=ROOT/'model'
parser=argparse.ArgumentParser();parser.add_argument('--phase',choices=['text','generate'],required=True);parser.add_argument('--plan',type=Path,required=True)
args=parser.parse_args();plan=json.loads(args.plan.read_text())
OUT=ROOT/'runs'/plan['label'];OUT.mkdir(parents=True,exist_ok=True)
started=time.time();stages=[]
result={'status':'failed','phase':args.phase,'plan':plan,'runtime_commit':'87db56a51758fefb748a359b90a5283bb8ba4837','model_revision':'bb1b055249614cf9d7cf4373fbdbc184b77dee88','paid_api_calls':0,'image_upload':False,'offline':True,'t5_weight_dtype':'native_bfloat16','system_or_upstream_source_changed':False,'stages':stages}

def stage(name,**details):
    event={'stage':name,'elapsed_seconds':round(time.time()-started,3),**details};stages.append(event)
    (OUT/'progress.json').write_text(json.dumps(event,indent=2)+'\n');print(json.dumps(event),flush=True)

try:
    assert json.loads((ROOT/'download-receipt.json').read_text())['total_bytes']==17142889289
    import mlx.core as mx
    import numpy as np
    from transformers import PreTrainedTokenizerFast,AutoTokenizer
    from mlx_video.models.wan_2 import generate as pipeline
    from mlx_video.models.wan_2.config import WanModelConfig
    from mlx_video.models.wan_2.utils import encode_text,_clean_text
    from PIL import Image,ImageDraw,ImageFont
    info=mx.device_info()
    limit=min(16*1024**3,int(info['max_recommended_working_set_size']*.9))
    mx.set_memory_limit(limit);mx.set_cache_limit(256*1024**2)
    result['memory_limit_bytes']=limit;result['device_info']=info
    prompt=(ROOT/plan['prompt_file']).read_text().strip()
    negative=(ROOT/plan['negative_file']).read_text().strip()
    CACHE=ROOT/'text-cache';CACHE.mkdir(exist_ok=True)
    def cache_path(text):return CACHE/(hashlib.sha256(_clean_text(text).encode()).hexdigest()+'.safetensors')
    tokenizer=PreTrainedTokenizerFast(tokenizer_file=str(MODEL/'tokenizer.json'),eos_token='</s>',unk_token='<unk>',pad_token='<pad>',model_max_length=512)
    assert tokenizer.pad_token_id==0 and tokenizer.eos_token_id==1
    tokens=tokenizer(prompt,max_length=512,truncation=True)['input_ids'];result['prompt_token_count']=len(tokens)
    def only_local_tokenizer(name,*a,**kw):
        assert str(name)=='google/umt5-xxl','Unexpected remote tokenizer request'
        return tokenizer
    AutoTokenizer.from_pretrained=only_local_tokenizer
    stage('local_runtime_ready',memory_limit_bytes=limit,prompt_tokens=len(tokens))
    if args.phase=='text':
        missing=[text for text in [prompt,negative] if not cache_path(text).exists()]
        if missing:
            from mlx_video.models.wan_2.text_encoder import T5Encoder
            config_data=json.loads((MODEL/'config.json').read_text())
            config=WanModelConfig(**{k:v for k,v in config_data.items() if k in WanModelConfig.__dataclass_fields__})
            stage('loading_native_bf16_t5')
            encoder=T5Encoder(vocab_size=config.t5_vocab_size,dim=config.t5_dim,dim_attn=config.t5_dim_attn,dim_ffn=config.t5_dim_ffn,num_heads=config.t5_num_heads,num_layers=config.t5_num_layers,num_buckets=config.t5_num_buckets,shared_pos=False)
            weights=mx.load(str(MODEL/'t5_encoder.safetensors'))
            assert all(w.dtype==mx.bfloat16 for w in weights.values()),'Expected native BF16 T5 tensors'
            encoder.load_weights(list(weights.items()));del weights;mx.eval(encoder.parameters())
            stage('t5_loaded',active_bytes=mx.get_active_memory(),peak_bytes=mx.get_peak_memory())
            result['contexts']=[]
            for text in missing:
                context=encode_text(encoder,tokenizer,text,config.text_len).astype(mx.float32);mx.eval(context)
                assert bool(mx.all(mx.isfinite(context)).item()),'T5 context has nonfinite values'
                details={'shape':list(context.shape),'std':float(mx.std(context).item()),'file':cache_path(text).name}
                assert details['std']>.0001
                mx.save_safetensors(str(cache_path(text)),{'context':context});result['contexts'].append(details)
                stage('text_context_cached',**details);del context;mx.clear_cache()
            del encoder;gc.collect();mx.clear_cache()
        result['status']='text_ready';result['cache_files']=[cache_path(t).name for t in [prompt,negative]]
    else:
        assert all(cache_path(t).exists() for t in [prompt,negative]),'Run text phase first'
        def load_context(_encoder,_tokenizer,text,text_len=512):
            context=mx.load(str(cache_path(text)))['context'];mx.eval(context)
            assert bool(mx.all(mx.isfinite(context)).item())
            return context
        pipeline.load_t5_encoder=lambda *a,**kw:None
        pipeline.encode_text=load_context
        def save_local_video(video,path,fps=24):
            video=np.asarray(video,dtype=np.uint8)
            assert video.ndim==4 and video.shape[3]==3
            assert video.shape[0]==plan['frames'],str(video.shape)
            result['output_shape']=list(video.shape)
            result['frame_change_mean']=float(np.abs(video[1:].astype(np.int16)-video[:-1].astype(np.int16)).mean())
            result['pixel_std']=float(video.std());assert result['pixel_std']>2,'Nearly flat output'
            stage('encoding_native_frames',shape=list(video.shape),fps=fps)
            h,w=video.shape[1:3]
            cmd=['/opt/homebrew/bin/ffmpeg','-y','-v','error','-f','rawvideo','-pix_fmt','rgb24','-s',f'{w}x{h}','-r',str(fps),'-i','-','-an','-c:v','libx264','-preset','medium','-crf','17','-pix_fmt','yuv420p','-movflags','+faststart',str(path)]
            with (OUT/'ffmpeg.log').open('w') as log:
                process=subprocess.Popen(cmd,stdin=subprocess.PIPE,stderr=log)
                for frame in video:process.stdin.write(frame.tobytes())
                process.stdin.close();assert process.wait()==0
            selected=sorted(set(np.linspace(0,len(video)-1,8).astype(int)))
            tiles=[]
            for f in selected:
                pic=Image.fromarray(video[f]);pic.save(OUT/(f'frame-{f:04d}.png'))
                tile=Image.new('RGB',(384,416),'#15171e');tile.paste(pic.resize((384,384)),(0,0));ImageDraw.Draw(tile).text((10,393),f'{f/fps:.2f}s',fill='white');tiles.append(tile)
            sheet=Image.new('RGB',(4*384,2*416),'#15171e')
            for n,tile in enumerate(tiles):sheet.paste(tile,((n%4)*384,(n//4)*416))
            sheet.save(OUT/'contact-sheet.png')
        pipeline.save_video=save_local_video
        stage('generating_video',frames=plan['frames'],width=plan['width'],height=plan['height'],steps=plan['steps'])
        input_image=ROOT/plan.get('image_file','tripod-input.png')
        assert input_image.parent==ROOT and input_image.is_file()
        result['input_image_sha256']=hashlib.sha256(input_image.read_bytes()).hexdigest()
        pipeline.generate_video(model_dir=str(MODEL),prompt=prompt,negative_prompt=negative,image=str(input_image),width=plan['width'],height=plan['height'],num_frames=plan['frames'],steps=plan['steps'],guide_scale=plan.get('guidance',5),shift=5,seed=plan['seed'],output_path=str(OUT/'tripod-native.mp4'),scheduler='unipc',tiling='aggressive',no_compile=plan.get('no_compile',False))
        movie=OUT/'tripod-native.mp4';assert movie.exists()
        decoded=subprocess.run(['/opt/homebrew/bin/ffmpeg','-v','error','-i',str(movie),'-f','null','-'],capture_output=True,text=True)
        assert decoded.returncode==0 and not decoded.stderr,decoded.stderr
        result['status']='generated';result['movie']={'bytes':movie.stat().st_size,'sha256':hashlib.sha256(movie.read_bytes()).hexdigest()};result['decode_errors']=0
    result['mlx_peak_bytes']=mx.get_peak_memory()
except Exception as error:
    result['error_type']=type(error).__name__;result['error']=str(error)
    (OUT/(args.phase+'-error.log')).write_text(traceback.format_exc());traceback.print_exc()
finally:
    result['elapsed_seconds']=round(time.time()-started,3)
    (OUT/(args.phase+'-receipt.json')).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
    print(json.dumps({k:v for k,v in result.items() if k!='stages'},ensure_ascii=False),flush=True)
if result['status']=='failed':raise SystemExit(1)
