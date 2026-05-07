// core/api.js - API 호출 및 로딩 표시

export function setLoading(v){ document.getElementById('loading').classList.toggle('show', v); }

export async function api(method, endpoint, body){
  const opts = { method, headers: {'Content-Type':'application/json'} };
  if(body) opts.body = JSON.stringify(body);
  const res = await fetch(endpoint, opts);
  if(!res.ok) throw new Error(`서버 오류 ${res.status}`);
  return res.json();
}
