/* popup แจ้งผลผิดพลาดกลาง (swal ไอคอน error + ปุ่ม OK) ตามมาตรฐานเดียวกับหน้า prospect
   โหลดจาก template.xhtml ให้ทุกหน้า — ใช้ร่วมกันหน้า lead_detail / lead / move_step_modal */
(function () {
    var MAX_RAW_LENGTH = 300;

    /* แกะข้อความ error จาก body ของ backend (string JSON หรือ object) ตรรกะเดียวกับ clErrText ใน contracts.xhtml */
    window.crmErrText = function (body) {
        var res = body;
        if (typeof body === 'string') {
            try { res = JSON.parse(body); } catch (e) { return body.slice(0, MAX_RAW_LENGTH); }
        }
        if (!res) { return ''; }
        var parts = [];
        if (res.message) { parts.push(res.message); }
        var err = res.error;
        if (err) {
            if (typeof err === 'string') {
                parts.push(err);
            } else {
                if (err.message && err.message !== res.message) { parts.push(err.message); }
                var detail = err.details || err.fieldErrors || err.errors;
                if (detail) {
                    try { parts.push(typeof detail === 'string' ? detail : JSON.stringify(detail)); } catch (e) { /* ignore */ }
                }
            }
        }
        return parts.join(' — ');
    };

    window.crmShowError = function (title, detail) {
        swal({ title: title, text: detail || '', icon: 'error' });
    };

    /* ★ 15/10/2026 — GET /leads/{id} (ผ่าน /board/lead) ของหน้า "ที่ไม่ใช่ lead_detail" (work_modal, sales_doc_rv) ตอบไม่ใช่ 2xx
       → popup error แสดง error.message ของ backend (fallback message ชั้นนอก → defaultMsg) กด OK แล้ว "อยู่ที่เดิม" (แค่ปิด popup)
       res = fetch Response ที่ !ok (ต้องเรียกก่อนอ่าน body) หรือ null = ต่อ server ไม่ได้ (network)
       401 ที่มี authRequired จาก SessionTokenFilter → modal กลางใน template.xhtml จัดการอยู่แล้ว → ไม่ซ้อน popup
       (lead_detail มี ldHandleLeadLoadFailed ของตัวเอง เพราะต้อง "กลับหน้าก่อนหน้า" ต่อ) */
    window.crmLeadFetchFailed = function (res, title, defaultMsg) {
        var show = function (body) {
            var msg = (body && body.error && body.error.message) || (body && body.message) || defaultMsg || '';
            swal({ title: title || '', text: String(msg), icon: 'error' });
        };
        if (!res) { show(null); return; }
        var status = res.status;
        var p;
        try { p = res.clone().text(); } catch (e) { show(null); return; }
        p.then(function (t) {
            var body = null;
            try { body = JSON.parse(t); } catch (e) { body = null; }
            if (status === 401 && body && body.authRequired) { return; }
            show(body);
        }).catch(function () { show(null); });
    };
})();
