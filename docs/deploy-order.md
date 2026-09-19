# BJJ 훈련일지 — 배포 작업절차서

> **이 프로젝트 배포의 정본.** 배포를 실행하기 전에 이 문서를 먼저 읽는다.
> 작성 2026-09-19 · 근거: VoiceVault 파일럿 실배포(`VoiceVault/docs/task-038-deploy-order.md`)와
> 워크스페이스 정본 [`dev-deploy-workflow.md`](../../docs/dev-deploy-workflow.md).
>
> | 문서 | 다루는 것 |
> |---|---|
> | [`../../docs/dev-deploy-workflow.md`](../../docs/dev-deploy-workflow.md) | 배포 **메커니즘** (스크립트·매니페스트·blue/green) |
> | [`../../docs/deployer-integration-procedure.md`](../../docs/deployer-integration-procedure.md) | 에이전트 **연계 정책**·게이트 |
> | **이 문서** | **이 프로젝트에서 실제로 무엇을 어떤 순서로 하는가** |
> | [`../deploy.yml`](../deploy.yml) | 이 프로젝트의 배포 매니페스트 |

---

## 0. 한 줄 요약

**맥에서 소스를 고치고 → 커밋·푸시하고 → `scripts/deploy.sh bjj-trainning --yes` 한 번.**
그 뒤는 우분투가 알아서 한다 — 새 릴리스 디렉토리에 빌드하고, 헬스체크가 통과해야만
`current` 심볼릭 링크를 옮긴다. 빌드가 깨져도 운영은 이전 릴리스로 계속 서 있다.

```
맥: NAS 소스 편집 → backend: npm run dev / web: npm run dev → 브라우저 검증 → git push
                                          │
                                scripts/deploy.sh bjj-trainning --yes  (SSH 한 번)
                                          ▼
우분투: 릴리스 전개 → 빌드 → 헬스체크 ─┬─ 통과 → current 전환 → 완료
                                       └─ 실패 → 자동 롤백 (운영 그대로)
```

> **현재 상태 (2026-09-19)**: ✅ **blue/green 컷오버 완료** — 릴리스 `20260919-225459-a6aeb379`, `RELEASE_RESULT status: ok`.
> pm2 `bjj` 가 `/home/brownjeon/apps/bjj/releases/…` 에서 돈다.
> **webhook 도 release.sh 위임으로 교체했다** — 이제 `git push` 가 곧 blue/green 배포다
> (종전 스크립트는 `webhook-deploy/pre-bluegreen-backup-20260919/` 에 보관).
> NFS 편집 트리에 빌드해도 운영에 반영되지 않는다.

---

## 1. 🔴 선결 조건 — 해소 전에는 배포하지 않는다

| # | 항목 | 상태 | 조치 주체 |
|---|---|---|---|
| 1 | 🔴 운영이 NFS 편집 트리에서 직접 구동 중 | 미해소 | 사용자 (컷오버, §9) |
| 2 | 🔴 webhook 자동배포가 이미 등록됨 → 이중 배포 위험 | 미해소 | 사용자 (§9) |
| 3 | 🔴 `@workspace/auth-oauth` 의 `file:` 상대경로가 릴리스 깊이에서 깨짐 | 미해소 | developer + 사용자 승인 |
| 4 | ⚠️ `web/` 에 `package-lock.json` 이 없어 `npm ci` 불가 | 미해소 | developer |
| 6 | `shared/.env`·`shared/backend/.env` 서버 배치 | 미해소 | 사용자 (§9) |

> **2026-09-19 실측 — 운영 루트는 이미 준비돼 있다.**
> `/home/brownjeon/apps/` 는 존재하고 현재 `voicevault/` 하나가 들어 있다.
> **프로젝트별 base 디렉토리는 사람이 만들 필요가 없다** — `release.sh` 가 첫 배포에서
> `git clone --mirror` 와 `mkdir -p "$BASE/shared"` 로 만든다.
> 사람이 미리 해야 하는 것은 **`shared/.env` 배치 하나뿐**이다(없으면 첫 배포가 의도적으로 실패한다).


### 3번 상세 — `npm ci` 가 깨지는 이유

`backend/package.json` 은 공용 OAuth 패키지를 **저장소 상대경로**로 참조한다.

```json
"@workspace/auth-oauth": "file:../../shared/auth-oauth"
```

`package-lock.json` 도 같은 상대경로(`../../shared/auth-oauth`)로 굳어 있다.
이 경로는 **lock 을 만든 디렉토리 깊이에서만** 맞는다. 릴리스 디렉토리에서 설치하면

```
/home/brownjeon/apps/bjj/releases/<타임스탬프>/backend/../../shared/auth-oauth
  = /home/brownjeon/apps/bjj/releases/shared/auth-oauth     ← 존재하지 않는다
```

로 풀려 `npm ci` 가 ENOENT 로 깨진다. VoiceVault 가 2026-09-18 첫 배포에서 같은 계열
문제를 실측했다(그쪽은 lock 이 `../../NFS/homes/...` 로 굳어 있었다).

**조치 방법 두 가지 — 사용자 판단 사항이다.**

| | 방법 | 평가 |
|---|---|---|
| A | `$BASE/releases/shared` → NAS `shared/` 심볼릭 링크 | 동작하지만 **취약하다.** `releases/` 는 `release.sh` 가 prune 하는 디렉토리라 보관 슬롯 하나를 잡아먹고, 언젠가 지워질 수 있다 |
| B | **(권장)** `backend/.npmrc` 에 `install-links=true` + `file:` 을 NFS 절대경로로 | TheMeal·VoiceVault 가 쓰는 방식. 설치 시 실제 파일로 복사되므로 런타임에 경로가 필요 없다. 트레이드오프: `shared/auth-oauth` 를 고치면 `npm install` 을 다시 돌려야 반영된다 |

> 어느 쪽이든 **`shared/auth-oauth` 는 git 밖 NAS 상주 패키지**라 릴리스에 포함되지 않고
> 롤백되지도 않는다. DB 마이그레이션과 같은 등급의 공유 자원으로 취급한다.

> **이 절에 미해소 항목이 하나라도 있으면 deployer 는 기동하지 않는다.**
> 배포하지 않고 "무엇이 남았는지"를 그대로 보고하는 것이 올바른 행동이다.

---

## 2. 배포 전 확인

```bash
cd /Volumes/homes/brownjeon/project/bjj-trainning

# ① 배포되는 것은 작업본이 아니라 origin 의 ref 다. 푸시 안 된 커밋이 있으면 그게 빠진다.
git status -sb | head -1          # "[ahead N]" 이 보이면 N 개가 아직 origin 에 없다
git log --oneline origin/main..HEAD

# ② 브랜치 확인 — deploy.yml 의 source.ref 와 같아야 한다
git branch --show-current         # 기대: main

# ③ 커밋되지 않은 변경
git status --short | head
```

- `ahead` 가 0 이 아니면 **푸시하거나**, 올리지 않을 커밋이면 사용자에게 확인받는다.
  `deploy.sh` 가 경고하지만 `--yes` 로 넘기면 그 경고도 지나간다.
- QA(`verdict=PASS`, 결함 0건) 보고가 없으면 기동하지 않는다.

### 이 프로젝트에서 꼭 볼 것 — 프론트 빌드

`web/dist` 는 `.gitignore` 대상이라 **저장소에 없다.** 릴리스에서 빌드하지 않으면
`/health` 는 200 인데 **화면만 비는** 상태가 된다.

🔴 2026-09-18 실사고: webhook 배포 스크립트가 `web/` 을 전혀 빌드하지 않아 **프론트 변경이
여러 커밋에 걸쳐 조용히 운영에 반영되지 않았다.** 그동안 배포는 매번 `exit=0` 으로 "성공"을
보고했고, 사용자가 화면에서 변화가 없는 걸 보고서야 발견했다.
`deploy.yml` 의 `build.command` 에 `cd web && npm run build` 가 들어 있는지 매번 확인한다.

---

## 3. 배포 실행

```bash
# ① 계획만 확인 — SSH 하지 않는다. 대상 호스트·경로·ref 를 눈으로 본다
scripts/deploy.sh bjj-trainning --dry-run

# ② 배포
scripts/deploy.sh bjj-trainning --yes
```



> ⚠️ **`--with-migrate` 를 스스로 붙이지 않는다.** 개발과 운영이 같은 NAS MariaDB
> (`192.168.219.154:3306`)를 본다. blue/green 롤백은 **코드만** 되돌리므로 마이그레이션은
> 되돌아가지 않는다. 필요하다고 판단되면 그 사실만 보고하고 사용자 승인을 기다린다.

---

## 4. 결과 판정

스크립트는 마지막에 `RELEASE_RESULT <json>` 한 줄을 출력한다.
**출력 문구가 아니라 이 JSON 의 `status` 로 판정한다.**

| `status` | 운영 상태 | 다음 조치 |
|---|---|---|
| `ok` | 새 릴리스 | §5 배포 후 확인으로 |
| `build_failed` | **영향 없음** (current 불변) | 빌드 로그 발췌 → developer. 수정 후 Reviewer 부터 재순환 |
| `health_failed` | **이전 릴리스로 자동 롤백됨** | pm2 로그 발췌 → developer. 수정 후 Reviewer 부터 재순환 |
| `rolled_back` | 이전 릴리스 (수동 롤백) | 사용자 지시로만 발생 |
| `rollback_unhealthy` | 🔴 **비정상** | 즉시 에스컬레이션. **추가 배포 시도 금지** |

```bash
scripts/deploy.sh bjj-trainning --status
scripts/deploy.sh bjj-trainning --logs 100
```

---

## 5. 배포 후 확인 — 여기가 핵심

`status: ok` 는 "프로세스가 떴다" 는 뜻이지 "기능이 동작한다" 는 뜻이 아니다.
아래를 **실제로 열어서** 확인한다. 확인하지 않은 항목은 "미확인"이라고 그대로 적는다.

### 화면

- [ ] `https://bjj.미라클펭귄.com` 메인 화면이 렌더링되는가
      — **빈 화면이면 `web/dist` 빌드 누락이다** (§2 의 실사고 참고)
- [ ] 이번 변경이 프론트를 건드렸다면 **그 화면에서 변경이 실제로 보이는가**
- [ ] `/uploads/...` 이미지·썸네일이 깨지지 않는가

### API·프로세스

```bash
scripts/deploy.sh bjj-trainning --status
scripts/deploy.sh bjj-trainning --logs 100
```

- [ ] `GET /health` 가 `{"success":true,...}` 를 돌려주는가
- [ ] pm2 재시작 횟수가 늘어나지 않는가 (늘면 크래시 루프다)
- [ ] 로그에 기동 직후 예외·스택트레이스가 없는가
- [ ] 영상분석을 건드렸다면 `yt-dlp` 가 PATH 에 잡히는가
      — `ecosystem.config.js` 가 `env.PATH` 를 고정하는 이유가 여기 있다(2026-09-07 회귀 이력)

---

## 6. 실패했을 때

### 롤백

```bash
scripts/deploy.sh bjj-trainning --rollback      # 직전 릴리스로
scripts/deploy.sh bjj-trainning --rollback 2    # 두 단계 전으로
```

`current` 심볼릭 링크를 되돌리고 pm2 를 reload 할 뿐이라 수 초면 끝난다.
**수동 롤백은 사용자 지시가 있을 때만** 한다 — 자동 롤백은 스크립트가 이미 한다.

> 🔴 **DB 마이그레이션은 되돌아가지 않는다.** 마이그레이션을 동반한 배포를 롤백하면
> 스키마와 코드가 어긋난 상태가 된다.
>
> ⚠️ **컷오버 직후 첫 롤백 주의.** 컷오버 이전에 만들어진 릴리스는 옛 `ecosystem.config.js`
> (미러·NFS 를 가리키는 cwd)를 담고 있다. 그리로 롤백하면 재등록이 옛 경로로 떨어져 실패한다.
> 새 ecosystem 으로 만든 릴리스가 2개 이상 쌓인 뒤에 롤백을 연습한다.

### ⚠️ webhook 배포의 헬스체크가 재기동을 앞질러 `exit=1` 을 낸다 (2026-09-19 실측)

2026-09-19 push 로 돈 webhook 배포가 **`exit=1` 로 끝났는데 운영은 정상이었다.**

```
========== 2026-09-19 02:04:02 START project_bjj-history sha=cae2b04 ==========
curl: (7) Failed to connect to 127.0.0.1 port 3000  (반복)
========== 2026-09-19 02:06:09 END project_bjj-history exit=1 ==========
```

직후 확인한 실제 상태:

| 확인 | 결과 |
|---|---|
| `pm2 list` 의 `bjj` | `online` |
| `curl 127.0.0.1:3000/health` | **200** |
| pm2 로그 | `[db] connected` · `[auth] OAuth 활성화: google` · `[static] dist 경로: ...` 정상 |

즉 **헬스체크 루프가 재기동 완료를 기다리지 못하고 먼저 포기한 것**이지 배포가 실패한 게 아니다.

**그래서 이 프로젝트에서는 `exit=1` 을 곧바로 실패로 보고하지 않는다.** 반드시 아래를 먼저 확인한다.

```bash
ssh home_ubuntu 'pm2 list | grep " bjj "'
ssh home_ubuntu 'curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/health'
```

둘 다 정상이면 **배포는 반영됐고 스크립트의 판정만 틀린 것**이다 — 그 사실을 그대로 보고한다.

#### 🔴 "재시도를 더 늘리면 된다"는 이미 두 번 해봤고 듣지 않았다

같은 실수를 반복하지 않도록 실측값을 남긴다.

```bash
# 실제로 도는 스크립트 (2026-09-19 확인)
/home/brownjeon/.local/webhook-deploy/deploy-bjj.sh:39
  for i in $(seq 1 90); do
    if curl -fsS http://127.0.0.1:3000/ -o /dev/null; then ok=1; break; fi
    sleep 1
```

- 재시도는 **이미 90회(=90초)** 다. 커밋 이력에도 `5→30`(`345b3c8`), `30→90`(`ddc1530`)으로
  **두 번 확대한 기록**이 있다. 그런데도 이번에 또 걸렸다.
- 이번 배포는 START 02:04:02 → END 02:06:09, 즉 **127초**가 걸렸다. 90초 창을 넘긴 것이다.
- 따라서 **문제는 재시도 한도가 아니라 기동이 90초를 넘긴다는 사실 자체**다.
  원인을 먼저 찾아야 한다 — 프론트 빌드 시간, NAS MariaDB 연결 지연(`[db] connected` 가
  로그에 두 번 찍혔다), pm2 reload 동작 중 어느 것인지.

> ⚠️ **한 가지 더**: 위 재시도 확대 커밋들은 저장소의 `.gitea/workflows/deploy.yml` 을 고쳤는데,
> **실제로 도는 것은 그 파일이 아니라 우분투의 standalone `deploy-bjj.sh` 다**
> (Gitea Actions 는 폐기된 경로 — [`../../docs/webhook-deploy-guide.md`](../../docs/webhook-deploy-guide.md)).
> 우분투 쪽 값이 90 인 것은 누군가 따로 맞춰 둔 결과이며, 저장소만 고치면 운영에 반영되지 않는다.
> 스크립트를 고칠 때는 **우분투의 그 파일**을 고쳐야 한다(사용자 작업 — deployer 권한 경계 밖).

### 흔할 만한 실패와 원인

| 증상 | 원인 | 조치 |
|---|---|---|
| `SSH 접속 불가` | **포트가 22 가 아니다** (이 환경은 **993**) | `deploy.yml` 의 `target.port` 확인 |
| `shared 파일이 없다: .../shared/.env` | 첫 배포 전 `.env` 미배치 | `scp` 로 올린다 (§9) |
| `ref 를 찾을 수 없다` | 커밋이 origin 에 push 되지 않음 / 브랜치명 오기 | push 후 재시도. 이 프로젝트 기본 ref 는 `main` |
| 배포는 됐는데 **옛 코드가 돈다** | `ecosystem.config.js` 의 `cwd` 가 릴리스를 가리키지 않음 | `cwd: __dirname` 으로 고친 뒤 `pm2 delete` → 재배포 |
| `npm ci` ENOENT (`file:` 의존성) | lock 의 상대경로가 릴리스 깊이에서 어긋남 | §1 의 해당 선결 과제 참고 |
| 빌드는 맥에서 되는데 우분투에서 깨진다 | 네이티브 모듈·파일명 대소문자·경로 가정 | **코드가 환경을 가정한 것이다.** Reviewer 재순환 대상 |
| webhook 배포가 `exit=1` 인데 화면은 정상 | 헬스체크가 재기동을 앞질렀다 (위 절) | pm2 상태·`/health` 를 직접 확인한 뒤 판정한다 |
| `배포가 이미 진행 중이다` | flock 점유 | 진행 중인 배포를 기다린다. 비정상 종료였다면 `$BASE/.deploy.lock` 확인 |

---

## 7. 하지 말 것

- ❌ 우분투에 직접 ssh 해서 `pm2` / `git pull` / `npm run build` 조작 — 배포 경로는 하나다
- ❌ `--with-migrate` 자체 판단 사용
- ❌ 사용자 승인 없는 수동 `--rollback`
- ❌ QA PASS 없이 배포
- ❌ 운영 릴리스 디렉토리 직접 편집 — 다음 배포에 사라진다. 편집 대상은 NAS 소스뿐이다
- ❌ 실패를 "환경 문제"로 단정하고 같은 명령 재시도
- ❌ 업로드 데이터(`files/bjj-trainning/`)를 옮기지 않는다 — 소스 트리 밖의 공유 자원이라 롤백되지 않는다

---

## 8. 보고 형식

**실측치만 적고, 확인하지 않은 항목은 "미확인"이라고 그대로 적는다.**

```
[배포 — BJJ 훈련일지]
- git log -1 / origin 대비 ahead:
- --dry-run 결과: (대상 호스트·경로·ref)
- RELEASE_RESULT: (JSON 원문 그대로)
- --status 결과: (current 릴리스·pm2·헬스)

[배포 후 확인]
- 메인 화면 렌더링: 예/아니오
- (프론트 변경 시) 화면에서 변경 확인: 예/아니오/해당없음
- /health 응답:
- pm2 재시작 횟수 변화:

[이상 징후]
- 로그의 ERROR·스택트레이스:
- 그 밖에 예상과 달랐던 것:
```

> ⚠️ VoiceVault 파일럿에서 QA 에이전트 3인이 테스트를 실행하지 않은 채 "PASS·결함 0건"을
> 보고했고 전부 사실이 아니었다. 배포는 운영을 바꾸는 행동이라 같은 일이 벌어지면 피해가
> 즉시 사용자에게 간다. **돌리지 않은 것을 돌렸다고 적지 않는다.**

---

## 9. 최초 컷오버 절차 (1회성)

운영 중인 서비스를 blue/green 구조로 옮기는 단계다. **되돌릴 수 있는 순서로 진행한다.**
`pm2 delete` 는 순간적인 서비스 중단을 동반하고 deployer 의 권한 경계 밖이므로 **사용자가 수행**한다.

```bash
# (1) 운영 루트와 shared 준비
ssh home_ubuntu 'mkdir -p /home/brownjeon/apps/bjj/shared'

# (2) .env 배치 — 없으면 첫 배포가 실패한다 (의도된 동작)
scp bjj-trainning/.env brownjeon@125.177.194.26:/home/brownjeon/apps/bjj/shared/.env   # 포트 993 필요 시 -P 993
scp bjj-trainning/backend/.env brownjeon@125.177.194.26:/home/brownjeon/apps/bjj/shared/backend/.env   # 포트 993 필요 시 -P 993

# (3) 계획 확인 (SSH 하지 않는다)
scripts/deploy.sh bjj-trainning --dry-run

# (4) 첫 릴리스 전개 + 빌드 + 헬스체크
#     이 시점에는 pm2 가 아직 옛 경로로 돌고 있다 — 운영은 영향받지 않는다
scripts/deploy.sh bjj-trainning

# (5) 헬스체크 통과를 확인한 뒤에만 pm2 재등록  ← 여기서 짧은 중단이 발생한다
ssh home_ubuntu 'pm2 delete bjj; cd /home/brownjeon/apps/bjj/current && pm2 startOrReload ecosystem.config.js --only bjj --update-env && pm2 save'

# (6) 확인
scripts/deploy.sh bjj-trainning --status
ssh home_ubuntu "pm2 jlist | python3 -c \"import sys,json;[print(a['name'],a['pm2_env']['pm_cwd']) for a in json.load(sys.stdin)]\""
#   기대: pm_cwd 가 /home/brownjeon/apps/bjj/releases/... 다
```

**실패 시 복귀** — pm2 를 옛 경로로 되돌린다. `apps/` 구조는 남겨둬도 운영에 영향이 없다.

```bash
ssh home_ubuntu 'pm2 delete bjj; cd <옛 경로> && pm2 start ecosystem.config.js --only bjj && pm2 save'
```

### 컷오버 완료 판정 — 전부 참일 때만 완료다

- [ ] `scripts/deploy.sh bjj-trainning --yes` 가 `RELEASE_RESULT {"status":"ok",...}` 로 끝난다
- [ ] `pm2 jlist` 의 `pm_cwd` 가 `/home/brownjeon/apps/bjj/releases/...` 다 (bjj 전부)
- [ ] 운영 실화면이 정상이다 (§5)
- [ ] `--rollback` 으로 이전 릴리스 복귀가 되고, **다시 배포해 원복**했다
      (릴리스가 2개 이상 쌓인 뒤에 한다)
- [ ] `deploy.yml`·`deployer.md`·이 문서가 커밋되고 **푸시**됐다
- [ ] webhook 훅 충돌을 (A) 또는 (B) 로 정리했다 (아래)

> **롤백을 실제로 한 번 돌려보는 것**이 가장 중요하다. 롤백은 사고 났을 때 처음 쓰게 되는데,
> 그때 처음 돌려보면 늦는다.
### ⚠️ webhook 자동배포와의 충돌 정리 (컷오버와 함께)

이 프로젝트는 Gitea webhook 자동배포가 **이미 등록돼 있다** (`project_bjj-history, hook_id 3` → `/home/brownjeon/.local/webhook-deploy/deploy-bjj.sh`).
blue/green 으로 컷오버하면서 이 훅을 그대로 두면 **push 한 번에 두 경로가 동시에 배포**된다.

컷오버 시 둘 중 하나를 택한다 — 사용자 판단 사항이다.
- **(A)** 훅 스크립트를 `release.sh` 경유로 교체 ([`../../docs/webhook-deploy-guide.md`](../../docs/webhook-deploy-guide.md))
  → push 만으로 blue/green 배포가 된다
- **(B)** 훅을 비활성화하고 `scripts/deploy.sh` 로만 배포
  → 배포 시점을 명시적으로 통제할 수 있다 (실매매·운영 민감 프로젝트에 권장)


---

## 10. 부록 — 경로·값 표

| 용도 | 값 |
|---|---|
| 편집 대상(유일한 SSOT) | `/Volumes/homes/brownjeon/project/bjj-trainning` (맥) / `/home/brownjeon/NFS/homes/brownjeon/project/bjj-trainning` (리눅스) |
| 맥 개발 실행 | NFS 가 `noexec` 이라 실행이 필요한 작업은 `~/.node-local/` 미러에서 한다. 이 프로젝트는 `.devmirror` 가 없어 수동 관리 중이다 |
| 운영 경로 | `/home/brownjeon/apps/bjj/current` |
| 릴리스 보관 | `/home/brownjeon/apps/bjj/releases/` (최근 5개) |
| 릴리스 간 유지 | `/home/brownjeon/apps/bjj/shared/` |
| pm2 앱 | `bjj` (단일) |
| 포트 | 3000 |
| 헬스 | `GET /health` (`backend/src/index.js:19`) |
| 운영 도메인 | https://bjj.미라클펭귄.com |
| 저장소 / ref | Gitea `project_bjj-history` ← **디렉토리명과 다르다** / `main` |
| 우분투 호스트 | `home-dev-x600` `125.177.194.26` · **sshd 993 포트** |
| DB | `192.168.219.154:3306` — **개발과 운영이 공유** |
| 매니페스트 | [`../deploy.yml`](../deploy.yml) |
| 실행 주체 | [`../.claude/agents/deployer.md`](../.claude/agents/deployer.md) |
