# GitHub Pages 배포 가이드

## 0. 준비물

- GitHub 계정 ([github.com](https://github.com)에서 무료 가입)
- 본인의 `ar_camera` 폴더 (이 README가 있는 폴더)

## 1. 새 저장소(Repository) 만들기

1. github.com 로그인 → 우상단 **+** → **New repository**
2. **Repository name**: 원하는 이름 (예: `choae-camera`, `ar-camera` 등 — 영문 소문자 + 하이픈 권장)
3. **Public** 선택 (Private은 GitHub Pages 무료 사용 불가, Pro 플랜부터 가능)
4. **Add a README**, **Add .gitignore**, **Choose a license** — 모두 **체크하지 않음** (빈 저장소로 시작)
5. **Create repository** 클릭

## 2. 파일 업로드 (가장 쉬운 방법: 웹 드래그&드롭)

1. 방금 만든 빈 저장소 페이지에서 **"uploading an existing file"** 링크 클릭
   - 또는 **Add file → Upload files** 메뉴
2. Mac Finder에서 `ar_camera` 폴더를 열고, **폴더 안의 모든 파일과 `characters/` 폴더**를 통째로 선택해서 브라우저 페이지로 드래그
   - ⚠️ `ar_camera` 폴더 자체가 아니라 그 **안의 내용물**을 올려야 함 (그래야 `index.html`이 저장소 루트에 위치)
3. 페이지 하단의 **Commit changes** 클릭

## 3. GitHub Pages 활성화

1. 저장소의 **Settings** 탭 → 좌측 **Pages**
2. **Source** 섹션:
   - **Deploy from a branch** 선택
   - Branch: **main** / Folder: **/ (root)**
3. **Save** 클릭
4. 1~2분 대기 후 페이지 새로고침하면 상단에 다음 메시지가 뜸:
   ```
   Your site is live at https://<유저명>.github.io/<저장소명>/
   ```

## 4. 폰에서 접속

1. 폰 브라우저(Chrome 또는 Safari)에서 발급받은 URL 열기
2. 카메라 권한 허용
3. (선택) 브라우저 메뉴 → **홈 화면에 추가** → 앱 아이콘으로 사용

## 5. 코드 변경 후 재배포

파일을 수정한 후:
- **변경된 파일만** 다시 업로드: 저장소 페이지에서 해당 파일 클릭 → 연필 아이콘(Edit) → 내용 붙여넣기 → Commit
- **여러 파일** 한꺼번에 갱신: **Add file → Upload files** 로 다시 드래그&드롭 (같은 이름 파일은 덮어씌워짐)

⚠️ **중요**: JS/CSS/HTML/이미지를 수정했다면 **`service-worker.js`의 `CACHE_NAME` 버전을 올려주세요** (예: `'choae-camera-v5'` → `'choae-camera-v6'`). 안 그러면 폰에 옛 버전이 캐시돼 있어서 새 버전이 안 뜹니다.

## 6. (선택) Git CLI로 더 깔끔하게 배포

웹 업로드 대신 Git을 쓰면 매번 드래그할 필요 없이 명령 한 줄로 배포 가능합니다. Mac 터미널에서:

```bash
cd ~/Desktop/project/ar_camera

# 처음 한 번만
git init
git add .
git commit -m "initial commit"
git branch -M main
git remote add origin https://github.com/<유저명>/<저장소명>.git
git push -u origin main

# 이후 변경 시
git add .
git commit -m "update"
git push
```

처음 push 시 GitHub에서 인증 토큰을 요구합니다 — [Personal Access Token 발급 가이드](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens) 참고.

## 7. (선택) GitHub Desktop 앱

GUI를 선호하면 [GitHub Desktop](https://desktop.github.com/) 설치 후, 저장소를 로컬에 클론하고 Finder에서 파일 복사 → 앱에서 Commit & Push.

## 자주 묻는 질문

**Q. URL이 검색에 잡히지 않게 할 수 있나요?**
A. `robots.txt`를 프로젝트 루트에 추가하세요:
```
User-agent: *
Disallow: /
```
검색 인덱싱은 차단되지만 URL을 직접 아는 사람은 여전히 접근 가능합니다.

**Q. 비밀번호로 보호하고 싶어요.**
A. GitHub Pages 자체엔 비밀번호 기능이 없습니다. 대안:
- Cloudflare Pages + Cloudflare Access 무료 플랜 (이메일 OTP 인증)
- 클라이언트 사이드 비밀번호 게이트 (보안 X, 우연한 접근만 차단)

**Q. 카메라가 안 켜져요.**
A. URL이 `https://`로 시작하는지 확인. GitHub Pages는 자동 HTTPS이지만, 일부 환경에서 첫 배포 직후 잠깐 HTTP만 뜰 수 있어요. 1~2분 대기 후 재시도.

**Q. 저장소 이름을 뭘로 할까요?**
A. 마음에 드는 영문 단어. 만약 이름을 `<유저명>.github.io` 로 정확히 맞춰서 만들면 URL이 서브경로 없이 `https://<유저명>.github.io/`로 깔끔해집니다 (사용자당 1개만 가능).
