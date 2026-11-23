/* ★ 28/09/2026 — ตรวจนามสกุลไฟล์แนบ "ก่อน" ยิง API อัปโหลด (TsAttachTypes)
   ใช้ร่วมกัน: tab เอกสารประกอบของ lead_detail / contracts / contracts_master_data
   (ทุกหน้ายิง /board/prospect/attachments — เดิมส่งไปก่อนแล้วค่อยรู้ว่าไม่ผ่านจาก error ของ backend)

   รายการที่อนุญาต = ค่า accept ของ input เลือกไฟล์ในแต่ละหน้า (ที่เดียว ไม่มีรายการซ้ำในไฟล์นี้)
   ปัจจุบัน accept="#{commonBean.uploadAcceptExt}" = FileServerAccess.ALLOWED_EXT ใน Java (ตัวหลัก — servlet ตรวจชุดเดียวกัน)
   - ".นามสกุล" → ชื่อไฟล์ต้องลงท้ายด้วยนามสกุลนั้น (ไม่สนตัวพิมพ์)
   - "image/*"  → MIME ของไฟล์ขึ้นต้นด้วย image/
   - "type/sub" → MIME ต้องตรงตัว
   accept ช่วยกรองแค่ในหน้าต่างเลือกไฟล์ ผู้ใช้ยังเลือก "All files" / ลากมาวางได้ จึงต้องตรวจซ้ำที่นี่

   ใช้: <script src="#{request.contextPath}/resources/js/attach_file_types.js?v=..."></script>
     TsAttachTypes.check(files, inputEl.getAttribute('accept'), msg)
       true = ผ่านทุกไฟล์ / false = มีไฟล์ไม่ผ่าน (แจ้ง swal ให้แล้ว) → ไม่อัปทั้งชุด
   msg = { notAllowed, allowed } ข้อความจาก commonBean.msg ของแต่ละหน้า */
(function () {
    'use strict';

    function tokensOf(accept) {
        return String(accept || '').split(',')
            .map(function (t) { return t.trim().toLowerCase(); })
            .filter(Boolean);
    }
    function matches(f, tokens) {
        var name = String((f && f.name) || '').toLowerCase();
        var type = String((f && f.type) || '').toLowerCase();
        for (var i = 0; i < tokens.length; i++) {
            var t = tokens[i];
            if (t.charAt(0) === '.') {
                if (name.length > t.length && name.slice(-t.length) === t) return true;
            } else if (t.slice(-2) === '/*') {
                if (type.indexOf(t.slice(0, -1)) === 0) return true;
            } else if (type === t) {
                return true;
            }
        }
        return false;
    }

    window.TsAttachTypes = {
        check: function (files, accept, msg) {
            var tokens = tokensOf(accept);
            if (!tokens.length) return true;   /* ไม่ได้กำหนด accept = ไม่จำกัดชนิด */
            var rejected = Array.prototype.slice.call(files || [])
                .filter(function (f) { return !matches(f, tokens); })
                .map(function (f) { return f.name; });
            if (!rejected.length) return true;
            swal({
                title: msg.notAllowed,
                text: rejected.join('\n') + '\n\n' + msg.allowed + ': ' + tokens.join(', '),
                icon: 'warning'
            });
            return false;
        }
    };
})();
