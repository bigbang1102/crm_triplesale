# AI HUB › เมนู Admin (token เท่านั้น) — สัญญา API ระหว่างหน้าจอกับ service ai-hub

ผู้ใช้เมนูนี้คือ **ลูกค้าที่ซื้อโปรแกรม** → **ห้ามมีต้นทุน / ราคา / เครดิต / USD / THB / ยอดเงินทุกชนิด** ทั้งใน response และหน้าจอ
แสดงเฉพาะ token (input / output / total) และจำนวนครั้ง/ผู้ใช้ — ข้อมูลทั้งหมดอยู่ใน `<aihub.mockup.data-dir>` (= `D:\mockup-data\Datasource`)

## 1. ที่เรียก
`POST {apiBase}/aihub/tools/admin-tokens` (ผ่าน dev proxy → `/aihub-api/tools/admin-tokens`), `multipart/form-data` (หรือ x-www-form-urlencoded) ช่อง `action` = ชื่อ action ด้านล่าง ;
ผลเป็น JSON `{ "ok": true, ... }` · ผิดพลาด `{ "ok": false, "error": "ข้อความไทย" }` (HTTP 403 ไม่มีสิทธิ์ / 400 ค่าผิด / 409 ซ้ำ)
เดือนเป็น `month=yyyy-MM` (เวลาไทย, ว่าง = เดือนนี้)

## 2. ตัวตน / สิทธิ์ (service ได้จาก query ที่ proxy ใส่ — ไม่รับจากฟอร์ม)
พารามิเตอร์ใหม่ที่ proxy ใส่ นอกเหนือจาก actor / actorId / actorUser / branchId / branchCode / branchName เดิม:
| พารามิเตอร์ | ความหมาย |
|---|---|
| `deptCode`, `deptName` | ฝ่าย/แผนกของผู้เรียก (ว่างได้ — service หาจาก org directory ด้วย username / employee code) |
| `tokenAdmin` | `1` = เปิดเมนู Admin ได้ (มีรหัส `AI_ADMIN_*` ตัวใดตัวหนึ่ง หรือ super_admin) — ไม่ใช่ = 403 ทุก action |
| `quotaAdmin` | `1` = ตั้ง/ลบโควตาได้ (`AI_ADMIN_QUOTA_MANAGE` หรือ super_admin) |
| `allBranch` | `1` = เห็นทุกบริษัท (`AI_ADMIN_USAGE_ALL_BRANCH` หรือ super_admin) ; ไม่ใช่ = เห็น/แก้เฉพาะบริษัทของตัวเอง (`branchCode`) |
`superAdmin=1` (เดิม) = ผ่านทุกข้อ

## 3. Org directory (`<data-dir>/aihub.org.json`) — โครงองค์กรที่ใช้แสดง/รวมยอด
```json
{ "updatedAt": "2026-11-21T09:00:00+07:00",
  "companies": [ { "code": "A1", "name": "ไพรม์ ออโต้ อิมพอร์ต",
     "departments": [ { "code": "A1-PO-MKT", "name": "ฝ่ายการตลาด",
        "employees": [ { "id": "A1-E003", "name": "…", "username": "…" } ] } ] } ] }
```
`company.code` ต้องเท่ากับ `branchCode` ที่ผู้ใช้เข้าระบบแล้วส่งมา (รหัสบริษัทของ mockup) · พนักงานที่ไม่มีแผนก = แผนก `-` "ไม่ระบุฝ่าย/แผนก" · service อ่านไฟล์นี้ตอนถูกเรียก (cache ตามเวลาไฟล์) ไม่มีไฟล์ = รวมยอดตามที่บันทึกใน usage เท่านั้น
usage / audit ทุกแถวเก็บ `departmentCode`, `departmentName` ตอนบันทึก (จาก Caller หรือจาก org directory)

## 4. Action
ทุกแถวสรุปมี **ฟิลด์ token ชุดเดียวกัน**: `tokens` (รวม), `inputTokens`, `outputTokens`, `runs`, `users` (จำนวนผู้ใช้ที่ใช้จริง) — ไม่มี cost
`quota` (ถ้ามี) = `{ "limit": 5000000, "used": 1234567, "remaining": 3765433, "percent": 24.7, "warnPercent": 80, "enabled": true, "level": "DEPARTMENT" }` ; `limit` 0 / ไม่ตั้ง = `null` ทั้งก้อน

### 4.1 `overview` — ใครใช้ token เท่าไร (ตาราง + กราฟ + drill-down ตามชั้น)
ส่ง: `month`, `level` = `company` | `department` | `user`, `company` (จำเป็นเมื่อ level = department/user ; ผู้ไม่มี allBranch ถูกบังคับเป็นบริษัทตัวเอง), `department` (จำเป็นเมื่อ level = user)
```json
{ "ok": true, "month": "2026-11", "level": "department", "company": {"code":"A1","name":"…"}, "department": null,
  "scope": { "label": "ไพรม์ ออโต้ อิมพอร์ต", "tokens":0, "inputTokens":0, "outputTokens":0, "runs":0, "users":0, "headcount": 21, "quota": null },
  "rows":  [ { "key":"A1-PO-MKT", "name":"ฝ่ายการตลาด", "tokens":0, "inputTokens":0, "outputTokens":0, "runs":0, "users":0, "headcount":3, "share": 12.5, "quota": null } ],
  "daily": [ { "date":"2026-11-01", "tokens":0, "inputTokens":0, "outputTokens":0 } ],
  "dailyByRow": { "A1-PO-MKT": [ { "date":"2026-11-01", "tokens":0 } ] },
  "months": [ { "month":"2026-06", "tokens":0 } ]   // 6 เดือนล่าสุดของ scope นี้ สำหรับกราฟแนวโน้ม
}
```
level=company → rows = บริษัท (ผู้ไม่มี allBranch เห็นแถวเดียว) · department → rows = แผนกของบริษัท · user → rows = พนักงานของแผนก (`key` = employee id, เพิ่ม `username`) ; แถวที่ไม่มีการใช้ก็ต้องออก (tokens 0) ให้ครบตาม org directory ; `share` = % ของ scope · เรียงมาก→น้อยตาม tokens

### 4.2 `detail` — ใช้โมดูล/โมเดลอะไร + เทียบโควตา
ส่ง: `month`, `level` = `company`|`department`|`user`, `key` (company code / department code / employee id), `company` (ต้องระบุเมื่อ level ≠ company), `department` (เมื่อ level = user)
```json
{ "ok": true, "month":"2026-11", "level":"user", "key":"A1-E003", "name":"…", "company":{...}, "department":{...},
  "totals": { "tokens":0, "inputTokens":0, "outputTokens":0, "runs":0, "users":0 },
  "quota": { ... } ,                        // ของระดับนี้
  "quotaChain": [ { "level":"COMPANY","key":"A1","name":"…","quota":{...} }, { "level":"DEPARTMENT",... }, { "level":"USER",... } ],  // ทุกระดับที่ครอบ (ว่างถ้าไม่ตั้ง) — ตัวที่เหลือน้อยที่สุดคือตัวที่ปิดก่อน
  "byTool":  [ { "toolId":"doc-analyze", "title":"วิเคราะห์เอกสาร", "group":"document", "groupTitle":"Document AI", "tokens":0, "inputTokens":0, "outputTokens":0, "runs":0, "users":0, "share":0 } ],
  "byGroup": [ { "group":"document", "groupTitle":"Document AI", "tokens":0, "runs":0 } ],
  "byModel": [ { "modelKey":"sonnet", "modelId":"us.anthropic.claude-sonnet-5-5", "label":"Claude Sonnet 5.5", "tokens":0, "inputTokens":0, "outputTokens":0, "runs":0, "share":0 } ],
  "toolModel": [ { "toolId":"…", "modelKey":"…", "tokens":0, "runs":0 } ],
  "daily": [ { "date":"…", "tokens":0 } ],
  "children": [ { "key":"…", "name":"…", "tokens":0, "quota": {...}|null } ]   // แผนกในบริษัท / พนักงานในแผนก (ว่างเมื่อ level=user) พร้อมโควตา+เหลือ
}
```

### 4.3 โควตา (token รายเดือน) 3 ระดับ — บริษัท / ฝ่ายแผนก / พนักงาน
- `quota-list`  ส่ง `month` (และ `level` ถ้าจะกรอง) → `{ "ok":true, "month":"…", "quotas":[ { "level":"COMPANY|DEPARTMENT|USER", "key":"…", "name":"…", "company":{"code","name"}, "department":{"code","name"}|null, "monthlyTokens":5000000, "warnPercent":80, "enabled":true, "note":"", "used":0, "remaining":0, "percent":0, "status":"ok|warn|full", "updatedBy":"…", "updatedAt":"…" } ] }` — ผู้ไม่มี allBranch เห็นเฉพาะบริษัทตัวเอง
- `quota-save`  ส่ง `level`, `key`, `company`, `department` (เมื่อ level = user), `monthlyTokens` (> 0 = จำกัด ; ไม่มีฟิลด์ต้นทุน), `warnPercent` (1–100, ค่าเริ่ม 80), `enabled`, `note` → ต้อง `quotaAdmin` ; ตรวจ: key ต้องมีใน org directory (ไม่มีไฟล์ org = รับตามที่ส่ง) ; ผู้ไม่มี allBranch ตั้งได้เฉพาะบริษัทตัวเอง ; บันทึก audit "ตั้งโควตา"
- `quota-delete` ส่ง `level`, `key`, `company` → ต้อง `quotaAdmin` ; บันทึก audit
- **บังคับใช้จริงที่ QuotaGate** ก่อนทุกงาน AI: ตรวจ 3 ระดับของผู้เรียก (บริษัท = branchCode, ฝ่าย = departmentCode, พนักงาน = employee id) ใช้ครบ**ระดับใดระดับหนึ่ง** = ปฏิเสธ (HTTP 429, หมวด QUOTA_EXCEEDED, ข้อความไทยบอกว่าระดับไหน ใช้ไปเท่าไร/ตั้งไว้เท่าไร และวันรีเซ็ต) ; ไม่มีโควตา/ปิดไว้/ไม่ทราบ = ผ่าน (fail-open เหมือนเดิม)
- โควตาเดิมระดับสาขา (`aihub.quota.json`, field เดิม) = ระดับ COMPANY (key = branchCode) — โควตาต้นทุน USD เดิม **ไม่ใช้/ไม่แสดง/ไม่เขียนค่าใหม่** (เก็บ 0)

### 4.4 `audit` — ตรวจการใช้งานจริงของผู้ใช้ทุกคน
ส่ง: `days` (1–90, ค่าเริ่ม 7), `company`, `department`, `user` (employee id หรือ username), `tool`, `q` (ค้นชื่อ/ username/ รหัสพนักงาน/ ชื่อไฟล์หรือข้อความงาน), `limit` (ค่าเริ่ม 50 สูงสุด 200), `offset`
```json
{ "ok": true, "total": 1234, "limit": 50, "offset": 0,
  "rows": [ { "id": 1, "at": "2026-11-21T09:12:33+07:00", "employeeId":"A1-E003", "username":"…", "name":"…",
              "company":{"code":"A1","name":"…"}, "department":{"code":"…","name":"…"},
              "toolId":"doc-analyze", "toolTitle":"วิเคราะห์เอกสาร", "groupTitle":"Document AI",
              "modelKey":"sonnet", "modelLabel":"Claude Sonnet 5.5",
              "inputTokens":0, "outputTokens":0, "tokens":0, "task":"ข้อความ/ชื่อไฟล์ที่ใช้ (ตัดไม่เกิน 120 ตัวอักษร)" } ],
  "events": [ { "at":"…", "actor":"…", "action":"ตั้งโควตา", "target":"แผนกฝ่ายการตลาด", "detail":"5,000,000 token/เดือน" } ] }
```
**ไม่มี** สถานะสำเร็จ/ผิดพลาด, เวลาตอบสนอง, ต้นทุน — (งานที่ผิดพลาดก็ยังเป็นแถว audit ได้แต่ไม่แสดงสถานะ) · `events` = การกระทำของผู้ดูแล (ตั้ง/ลบโควตา ส่งออก ฯลฯ) จาก `aihub.audit.json` 20 รายการล่าสุดตามตัวกรองวัน
- `audit-export` ส่งตัวกรองเดียวกัน → ไฟล์ CSV (UTF-8 BOM) คอลัมน์: เวลา, บริษัท, ฝ่าย/แผนก, พนักงาน, username, โมดูล, เครื่องมือ, โมเดล, input, output, รวม — ไม่มีต้นทุน (ใช้กลไกส่งไฟล์เดิมของ `admin-usage export`)

## 5. ไฟล์ข้อมูลใน `<data-dir>`
`aihub.usage.json` (ต่อแถว: เพิ่ม `departmentCode`, `departmentName`) · `aihub.audit.json` · `aihub.quota.json` (เพิ่ม `level`, `departmentCode` ; แถวเก่าที่ไม่มี level = COMPANY) · `aihub.org.json` (ข้อ 3)
สคริปต์สร้างข้อมูลตัวอย่างสำหรับ demo: `tools/mockup-seed-aihub.mjs` (ในโปรเจกต์ Angular mockup) — อ่านโครงองค์กรจาก `seed.workbook.master.json` / `seed.org.json` / `users.json`, สร้าง `aihub.org.json` + usage ตัวอย่าง 60 วัน (token เท่านั้น) ; **ไม่เขียนทับไฟล์ `aihub.*.json` ที่มีอยู่แล้วเว้นแต่ `--force`**

## 6. ที่ service ทำจริง (ยืนยันแล้ว 21/11/2026) — ส่วนที่ละเอียดขึ้น / ต่างจากร่างข้างบน
Service: `triplesales-ai` เครื่องมือ `admin-tokens` (`AdminTokensTool` + `TokenReports` + `OrgDirectory` + `QuotaGate`) · เฉพาะโหมด mockup (`aihub.mockup.data-dir`) ; ไม่ตั้ง = ตอบ `{ok:false,error:"admin-tokens needs mockup data dir"}` (HTTP 200)
- **ซองคำตอบ**: Hub ห่อผลของทุกเครื่องมือเป็น `{ok:true, tool, group, title, models, usage, elapsedMs, result:{…}}` — JSON ในข้อ 4 คือ **`result`** (ในนั้นมี `"ok":true` ให้ด้วย) ; ผิดพลาดเป็น `{ok:false, error:"ข้อความไทย", category}` พร้อม HTTP : `FORBIDDEN` 403 · `INVALID_INPUT` 400 · `NOT_FOUND` 404 · `QUOTA_EXCEEDED` 429 (ของงาน AI ที่ติดโควตา). **ไม่มี 409** : `quota-save` เป็น upsert (ระดับ+บริษัท+key เดียวกัน = แก้รายการเดิม)
- **พารามิเตอร์ที่ proxy ใส่ (query เท่านั้น — ค่าที่มากับฟอร์มถูกทิ้ง)**: `deptCode` `deptName` `tokenAdmin` `quotaAdmin` `allBranch` (+ เดิม `superAdmin` `actor` `actorId` `actorUser` `branchId` `branchCode` `branchName`) ; `actorId` ต้องเป็น **รหัสพนักงานของ org** (เช่น `A1-E003`) ไม่ใช่เลข id ; `branchCode` ต้องเท่ากับ `company.code` ใน `aihub.org.json`
- **สิทธิ์**: ไม่มี `tokenAdmin=1`/`superAdmin=1` = 403 ทุก action · `quota-save`/`quota-delete` ต้อง `quotaAdmin=1`/`superAdmin=1` · ไม่มี `allBranch=1`/`superAdmin=1` : `overview` / `detail`(level≠company) / `audit` / `audit-export` / `quota-list` ถูกบังคับเป็นบริษัทตัวเองแบบเงียบ (ค่า `company` ที่ส่งมาถูกเมิน) ; **ระบุตัวบริษัทอื่นตรง ๆ = 403** : `detail level=company key=<อื่น>` · `quota-save` / `quota-delete` ของบริษัทอื่น ; ไม่ทราบ `branchCode` ของผู้ใช้ (และไม่มี allBranch) = `overview level≠company` ตอบ 400 และ `audit` ว่าง
- **รหัส model** ใน `byModel` / `toolModel` / audit คือ key ของ ModelCatalog ของ service (`claude-sonnet`, `claude-haiku` …) ไม่ใช่ `sonnet` ; `label` เป็นชื่อเต็ม (เช่น "Claude Sonnet 5.5")
- **เวลา**: ทุก timestamp เป็น `yyyy-MM-dd'T'HH:mm:ss+07:00` ครบวินาที · เดือน/วันตัดเวลา Asia/Bangkok
- **overview**: `daily` เติมครบทุกวันของเดือน (ไม่มีใช้ = 0) ; `dailyByRow` เป็น **sparse** (เฉพาะวันที่แถวนั้นใช้ token) ; `months` 6 เดือน (เดือนที่ขอเป็นเดือนสุดท้าย) ; `company` เป็น `null` เมื่อ level=company และมี allBranch ; แถว user มี `username`, แถว company/department มี `headcount` ; `scope.quota` = โควตาของชั้นที่ครอบ (department → โควตาบริษัท, user → โควตาฝ่าย ; company → null) ; พนักงานที่เรียกด้วยรหัส/ username ที่หาใน org ได้ถูกรวมเป็นแถวเดียวกับรหัสใน org
- **detail**: `quotaChain` มีเฉพาะระดับที่ตั้งโควตา (`limit`>0) ; `used` ของแต่ละระดับ = ยอดทั้งระดับนั้น (ทั้งบริษัท / ทั้งฝ่าย / ตัวคน) ไม่ใช่เฉพาะส่วนของ key ; `children` ของ company = ฝ่าย, ของ department = พนักงาน ; `key` ของ level=user ต้องเป็นรหัสพนักงาน
- **quota-list**: `status` = `full` (ใช้ ≥ limit) | `warn` (≥ warnPercent) | `ok` (โควตาที่ปิดไว้ก็ `ok` แต่ `enabled:false`) ; เรียง COMPANY → DEPARTMENT → USER
- **quota-save**: `monthlyTokens` ต้อง > 0 (0 = 400 — ถ้าไม่ต้องการจำกัดให้ `quota-delete`) · `warnPercent` นอก 1–100 = 400 · `level=COMPANY` ไม่ส่ง `key` = บริษัทตัวเอง · มี org directory แล้ว `company`/ฝ่าย/พนักงาน ที่ไม่มี = 400 · ตอบ `{ok, saved:true, quota:{…แถวแบบ quota-list…}}` ; `quota-delete` ตอบ `{ok, deleted:true|false}`
- **บังคับใช้ (QuotaGate)**: ตรวจพนักงาน → ฝ่าย/แผนก → บริษัท ตามลำดับ ระดับแรกที่ใช้ครบ = 429 `QUOTA_EXCEEDED` ข้อความ "โควตา AI ระดับ{พนักงาน|ฝ่าย/แผนก|บริษัท} <ชื่อ> ในเดือนนี้ใช้ครบแล้ว (ใช้ / ตั้ง token) — จะรีเซ็ตวันที่ yyyy-MM-01 …" ; ฝ่ายของผู้เรียก = `deptCode` ที่ proxy ส่ง หรือหาจาก org ด้วย employee id / username (ไม่พบ = ฝ่าย `-`) ; ยอดนับ **ทุกแถวของเดือน** (แถวผิดพลาดมี token 0) ; แคชโควตา 30 วินาที / ยอดใช้ 10 วินาที (แก้โควตาผ่านเครื่องมือมีผลทันที) ; ที่เก็บอื่นที่ไม่ใช่ mockup = ด่านโควตาบริษัทแบบเดิม (token + USD) ไม่เปลี่ยน
- **audit**: แถวมาจากทุกแถวใน usage (รวมแถวผิดพลาด แต่ไม่แสดงสถานะ) ; `user` ตรงกับรหัสพนักงาน หรือ username (ไม่สนตัวพิมพ์) ; `q` ค้นชื่อ / username / รหัสพนักงาน / ชื่องาน / รหัสและชื่อเครื่องมือ ; `limit` 1–200 (ค่าเริ่ม 50) ; `events` = เฉพาะการกระทำของเครื่องมือ `admin-*` ที่ **สำเร็จ** (ความพยายามที่ถูกปฏิเสธไม่แสดง) 20 รายการล่าสุด ; ผู้ไม่มี allBranch เห็นเฉพาะเหตุการณ์ของบริษัทตัวเอง (บริษัทเป้าหมายของโควตา หรือบริษัทของผู้กระทำ)
- **audit-export**: ตอบ `{ok, fileId, fileName:"aihub_token_audit_<วันที่>.csv", size, rows}` (artifact ของ service เหมือน `admin-usage export-audit` — ดาวน์โหลดด้วย `GET /aihub-api/files/{fileId}?download=1`) ; CSV UTF-8 BOM หัวคอลัมน์ `เวลา,บริษัท,ฝ่าย/แผนก,พนักงาน,username,โมดูล,เครื่องมือ,โมเดล,input,output,รวม` ; ไม่แบ่งหน้า สูงสุด 200,000 แถว
- **บันทึก audit ของผู้ดูแล** (`aihub.audit.json`, HubController): `quota-save` / `quota-delete` / `audit-export` ของ `admin-tokens` — `target` = `LEVEL|รหัสบริษัท|key` (COMPANY ไม่มี key) · `detail` = `monthlyTokens=… · warnPercent=… [· enabled=…]` / `days=…` (ไม่เก็บคำค้น) ; service แปลงเป็นข้อความไทยใน `events` เอง ("ตั้งโควตา" · "แผนก ฝ่ายการตลาด" · "5,000,000 token/เดือน (เตือนที่ 80%)")
- **ไฟล์ข้อมูล** (คอลัมน์ snake_case เหมือนตารางเดิม): `aihub.usage.json` เพิ่ม `department_code`, `department_name` (service อ่าน `departmentCode`/`departmentName` ได้ด้วย) · `aihub.quota.json` เพิ่ม `level` (ไม่มี = COMPANY), `department_code`, `department_name`, `user_key`, `user_name` ; แถวใหม่เก็บ `monthly_cost_usd` = 0 เสมอ ; แถวโควตาบริษัทแบบเดิมยังใช้ได้ (เป็น COMPANY, คอลัมน์ต้นทุนถูกเมิน)
- **ตัวสร้างข้อมูล demo** `node tools/mockup-seed-aihub.mjs [--dir <Datasource>] [--out <โฟลเดอร์เขียน>] [--force] [--days 60] [--end 2026-11-21] [--seed N]` : อ่านจาก `--dir` / env `MOCKUP_DATASOURCE` (ค่าเริ่ม `D:\mockup-data\Datasource`) เขียนลง `--out` (ค่าเริ่ม = `--dir`) ; ไม่เขียนทับไฟล์ที่มีอยู่เว้นแต่ `--force` ; ผลซ้ำได้ (PRNG กำหนดจาก seed) ; **โควตาตัวอย่างที่ "เต็ม" ทำให้ผู้ใช้ในส่วนนั้นเรียก AI ไม่ได้จริง (429) ในเดือนของ `--end`** — ดูรายการที่พิมพ์ตอนรัน
