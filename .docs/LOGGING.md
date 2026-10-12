# 응답 로그 설정 (Google Sheets)

GitHub Pages는 정적 호스팅이라 서버가 없습니다. 그래서 게임이 응답을 **Google Apps Script 웹앱**으로 보내고, 그 스크립트가 **Google 스프레드시트**에 한 줄씩 기록합니다. 시트를 열면 로그를 바로 볼 수 있습니다.

## 기록되는 내용

| 열 | 설명 |
|----|------|
| time | 기록 시각 (UTC, ISO 형식) |
| type | `start`(게임 시작) / `complete`(결과 도달). 시작 대비 완료율 계산에 사용 |
| session | 한 판을 구분하는 ID (start와 complete가 같은 값) |
| name | 사용자가 입력한 이름 (최대 20자) |
| questions | 응답한 질문 수 |
| top3 | 추천 Top 3 디저트와 일치도 |
| region | 가장 가까운 지역 계보 |
| answers | 질문 문구와 YES/NO 목록 (JSON) |

## 설정 방법 (약 5분)

1. [Google Sheets](https://sheets.google.com)에서 새 스프레드시트를 만든다 (이름 예: `dessert-log`).
2. 메뉴 **확장 프로그램 > Apps Script**를 열고, 기존 코드를 지우고 아래 코드를 붙여 넣는다.

```javascript
function doPost(e) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sh = ss.getSheetByName('log') || ss.insertSheet('log');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['time', 'type', 'session', 'name', 'questions', 'top3', 'region', 'answers']);
  }

  let d = {};
  try { d = JSON.parse(e.postData.contents); } catch (err) { return ContentService.createTextOutput('bad request'); }

  // 사용자 입력이 수식으로 실행되지 않도록 앞에 ' 를 붙이고, 길이를 제한
  const safe = v => {
    const s = String(v == null ? '' : v).slice(0, 2000);
    return /^[=+\-@]/.test(s) ? "'" + s : s;
  };

  sh.appendRow([
    safe(d.time), safe(d.type), safe(d.session), safe(d.name),
    safe(d.questions), safe(d.top3), safe(d.region),
    safe(d.answers ? JSON.stringify(d.answers) : '')
  ]);
  return ContentService.createTextOutput('ok');
}
```

3. 오른쪽 위 **배포 > 새 배포 > 유형: 웹 앱**을 선택한다.
   - 실행 사용자: **나**
   - 액세스 권한: **모든 사용자**
   - 배포 후 권한 승인 화면이 나오면 승인한다.
4. 발급된 **웹 앱 URL** (`https://script.google.com/macros/s/.../exec`)을 복사한다.
5. [index.html](../index.html)의 `const LOG_URL = '';` 에 그 URL을 넣고 저장한 뒤 푸시한다.

```javascript
const LOG_URL = 'https://script.google.com/macros/s/xxxxxxxx/exec';
```

6. 게임을 한 번 끝까지 해 보고, 시트의 `log` 탭에 `start`와 `complete` 두 줄이 생겼는지 확인한다.

> 스크립트 코드를 수정한 뒤에는 **배포 관리 > 편집 > 새 버전**으로 다시 배포해야 반영됩니다.

## 주의 사항

- **개인정보**: 이름과 응답을 수집하므로 시작 화면에 수집 안내 문구를 넣었다. 실명을 받는 용도라면 사내/학교 방침을 확인하고, 가능하면 닉네임을 쓰게 안내한다. 시트 공유 권한은 본인에게만 둔다.
- **URL 노출**: 저장소가 Public이라 웹 앱 URL도 누구나 볼 수 있다. 이 URL은 **기록 추가만** 가능하고 시트를 읽을 수는 없지만, 누군가 임의 데이터를 계속 보낼 수 있다. 이상한 로그가 보이면 웹 앱을 새로 배포(새 URL)해서 교체한다.
- **보내기 실패**: 네트워크가 막혀 있어도 게임은 정상 진행되고, 로그는 브라우저 Local Storage(`dessert_log`, 최근 200건)에도 남는다. 다만 이 사본은 그 사용자의 브라우저에만 있어 내가 볼 수는 없다.
- **회사 계정**: 회사 Google Workspace 계정은 외부 공개 웹 앱 배포가 정책상 막혀 있을 수 있다. 막히면 개인 Google 계정으로 만든다.
- 정확한 완료율은 `type=start` 수 대비 `type=complete` 수로 계산한다 (중간 이탈은 start만 남는다).
