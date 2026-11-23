/* ============================================================================
 * input_guard.js — ดักอักขระพิเศษในช่องกรอกข้อมูลให้ทั้งระบบ
 * ----------------------------------------------------------------------------
 * ทำไมต้องมี: ข้อมูลที่ผู้ใช้กรอก (ชื่อลูกค้า, ที่อยู่, หมายเหตุ ฯลฯ) ถูกส่งต่อไป
 *   หลายทาง — บันทึกผ่าน API, เอาไปวาดกลับบนหน้าจอ, ใส่ในรายงาน/เอกสาร
 *   อักขระอย่าง  <  >  "  '  `  \  ;  |  {  }  [  ]  $  ^  ~  ไม่ใช่ข้อมูลจริง
 *   ของงานขาย แต่เป็นตัวเปิดช่องโหว่ (XSS / SQL injection / EL injection ${..} #{..})
 *   จึงดักไม่ให้พิมพ์/วางลงช่องกรอกตั้งแต่แรก แทนที่จะไปไล่ล้างตอนบันทึก
 *
 * ทำไมทำที่นี่ที่เดียว (ไม่ไล่ใส่ validator ทีละช่องทุกหน้า):
 *   - ช่องกรอกในระบบมีหลายร้อยจุดกระจายหลายสิบหน้า + อีกมากที่ JS/JSF ajax
 *     สร้างขึ้นทีหลัง (dialog, แถวตาราง, ส่วนที่ re-render) ใส่ในมาร์กอัปไม่มีทางครบ
 *   - ใช้ event delegation ที่ document (capture) — ช่องที่เกิดใหม่ถูกดักทันที
 *     ไม่ต้องมี MutationObserver ไม่ต้อง re-bind หลัง ajax
 *   - หน้าใหม่ที่ทำเพิ่มทีหลังได้ผลนี้อัตโนมัติ ไม่ต้องจำว่าต้องใส่
 *   โหลดจาก WEB-INF/pages/template.xhtml (ครอบทุกหน้าที่ใช้เทมเพลตกลาง)
 *   ส่วนหน้าที่เป็น HTML เดี่ยว ๆ (iframe frame) ต้องแปะ script เองในหน้านั้น
 *
 * ★ นี่คือด่านหน้า (UX) ไม่ใช่ด่านสุดท้าย — ฝั่ง server ยังต้อง validate เองเสมอ
 *   ตาม CLAUDE.md ข้อ 6 เพราะ client-side ถูก bypass ได้
 *
 * ปรับต่อรายช่องได้โดยไม่ต้องแก้ไฟล์นี้ (ใส่ attribute ที่ตัว input/textarea):
 *   data-allow-special           -> ปล่อยผ่านทั้งหมด ไม่ดักช่องนี้
 *   data-block-chars="<>&"       -> กำหนดชุดอักขระต้องห้ามเองเฉพาะช่องนี้
 * ========================================================================== */
(function () {
    'use strict';

    /* ── ชุดอักขระต้องห้าม ────────────────────────────────────────────────
       DEFAULT — ใช้กับช่องข้อมูลทั่วไป
         < >          แท็ก HTML (XSS)
         " ' `        ปิด/เปิด quote (SQL injection, แทรก attribute, template literal)
         \            escape sequence
         ;            คั่นคำสั่ง SQL
         |            คั่นคำสั่ง OS / pipe
         { } $        EL injection — ${...} ของ JSP/JSF (คู่กับ #{...} ที่ตายไปด้วยเพราะ { ถูกบล็อก)
         [ ]          แทรกโครงสร้าง JSON / array
         ^ ~          ไม่เคยเป็นข้อมูลจริงของงานขาย
       ที่ "ไม่" บล็อกเพราะเป็นข้อมูลจริงที่ผู้ใช้พิมพ์: - _ . , / : ( ) @ # & + = ? ! %
       (บ้านเลขที่ 12/3, บริษัท เอ แอนด์ บี, ลด 5%, อีเมล, เบอร์ +66 ฯลฯ) */
    var BLOCKED_DEFAULT = '<>"\'`\\;|{}[]$^~';

    /* RELAXED — ช่อง URL/อีเมล ที่อักขระบางตัวเป็นส่วนหนึ่งของค่าจริง
       (IPv6 ใน URL ใช้ [ ] , path ใช้ ~ $ ) เหลือดักเฉพาะตัวที่อันตรายล้วน ๆ */
    var BLOCKED_RELAXED = '<>"\'`\\;';

    /* ชื่อ/ไอดีของช่องที่ถือว่าเป็น URL หรืออีเมล -> ใช้ชุด RELAXED
       ใช้ 'email' ไม่ใช่ 'mail' เพื่อไม่ให้ไปโดนช่อง mailing address (ที่อยู่จัดส่ง) */
    var RELAXED_TYPES = ['url', 'email'];
    var RELAXED_HINTS = ['url', 'link', 'website', 'email'];

    /* input type ที่ไม่ต้องดัก
       - password เว้นไว้ตั้งใจ: รหัสผ่านควรตั้งอักขระพิเศษได้ (และไม่ได้ถูกเอาไปวาดบนหน้าจอ)
       - number/date/time/color/range เบราว์เซอร์คุมรูปแบบให้อยู่แล้ว และบางตัว
         setSelectionRange() ใช้ไม่ได้ (throw) */
    var SKIP_INPUT_TYPES = ['hidden', 'checkbox', 'radio', 'file', 'submit', 'reset',
                            'button', 'image', 'range', 'color', 'password',
                            'number', 'date', 'time', 'datetime-local', 'month', 'week'];

    /* ช่องที่เป็น "ตัวกรองใน dropdown" ฝั่ง client ล้วน ๆ — ค่าไม่เคยถูกส่งไป server
       จึงไม่มีประโยชน์ด้านความปลอดภัย มีแต่จะกวนตอนผู้ใช้ค้นหา
         .ods-search              ช่องค้นหาใน dropdown กลางของระบบ (open_down_select.js)
         .ui-selectonemenu-filter ช่องค้นหาใน p:selectOneMenu filter="true" ของ PrimeFaces */
    var SKIP_SELECTOR = '.ods-search, .ui-selectonemenu-filter, [data-allow-special]';

    /* หน้าที่ยกเว้นทั้งหน้า — ใส่ชื่อไฟล์ไม่ต้องมีนามสกุล (ตอนนี้ไม่มี เว้นไว้ให้เติมทีหลัง) */
    var EXCLUDED_PAGES = [];

    var WARN_MS = 2200;          /* ข้อความเตือนโชว์นานเท่าไร */
    var WARN_ID = 'ig-warn-tip';

    /* ข้อความจาก messages_<lang>.properties ผ่าน bridge ที่ template.xhtml ปล่อยไว้ให้
       โหลดไม่ทัน/ไม่มี -> fallback ไทย หน้าไม่พัง */
    var I18N = window.INPUT_GUARD_I18N || {};
    var MSG_BLOCKED = I18N.blocked || 'ไม่อนุญาตให้ใช้อักขระพิเศษ';

    /** ชื่อหน้าปัจจุบันจาก URL เช่น /triplesale/pages/contracts.face -> "contracts" */
    function currentPageName() {
        var path = (window.location && window.location.pathname) || '';
        var file = path.substring(path.lastIndexOf('/') + 1);
        var dot = file.lastIndexOf('.');
        return (dot > -1 ? file.substring(0, dot) : file).toLowerCase();
    }

    function matches(el, selector) {
        var fn = el.matches || el.msMatchesSelector || el.webkitMatchesSelector;
        return fn ? fn.call(el, selector) : false;
    }

    /** ช่องนี้ต้องดักไหม */
    function isGuarded(el) {
        if (!el || el.nodeType !== 1) {
            return false;
        }
        var tag = (el.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
            return false;
        }
        if (el.readOnly || el.disabled) {
            return false;
        }
        if (tag === 'input') {
            var type = (el.getAttribute('type') || 'text').toLowerCase();
            if (SKIP_INPUT_TYPES.indexOf(type) > -1) {
                return false;
            }
        }
        return !matches(el, SKIP_SELECTOR);
    }

    /** ชุดอักขระต้องห้ามของช่องนี้ */
    function blockedCharsOf(el) {
        var custom = el.getAttribute('data-block-chars');
        if (custom !== null && custom !== undefined) {
            return custom;
        }
        var type = (el.getAttribute('type') || '').toLowerCase();
        if (RELAXED_TYPES.indexOf(type) > -1) {
            return BLOCKED_RELAXED;
        }
        var key = ((el.id || '') + ' ' + (el.name || '')).toLowerCase();
        for (var i = 0; i < RELAXED_HINTS.length; i++) {
            if (key.indexOf(RELAXED_HINTS[i]) > -1) {
                return BLOCKED_RELAXED;
            }
        }
        return BLOCKED_DEFAULT;
    }

    /** อักขระต้องห้ามตัวแรกที่เจอใน text (ไม่เจอ -> '') */
    function firstBlocked(text, blocked) {
        for (var i = 0; i < text.length; i++) {
            if (blocked.indexOf(text.charAt(i)) > -1) {
                return text.charAt(i);
            }
        }
        return '';
    }

    /** ตัดอักขระต้องห้ามออกจาก text */
    function strip(text, blocked) {
        var out = '';
        for (var i = 0; i < text.length; i++) {
            if (blocked.indexOf(text.charAt(i)) < 0) {
                out += text.charAt(i);
            }
        }
        return out;
    }

    /** นับอักขระต้องห้ามที่อยู่ก่อนตำแหน่ง pos — ใช้คำนวณตำแหน่งเคอร์เซอร์หลังตัดทิ้ง */
    function countBlockedBefore(text, pos, blocked) {
        var n = 0;
        for (var i = 0; i < pos && i < text.length; i++) {
            if (blocked.indexOf(text.charAt(i)) > -1) {
                n++;
            }
        }
        return n;
    }

    /* ── ข้อความเตือน ────────────────────────────────────────────────────
       กล่องเดียวใช้ซ้ำทั้งหน้า วางเป็นลูกของ body โดยตั้งใจ:
       .layout-main ของ pandora layout มี transform ซึ่งทำให้ position:fixed
       ข้างในไปอ้างอิงกล่องนั้นแทน viewport (บั๊กเดิมของ dropdown/ai_menu) */
    var warnTimer = null;

    function warnTip() {
        var tip = document.getElementById(WARN_ID);
        if (tip) {
            return tip;
        }
        tip = document.createElement('div');
        tip.id = WARN_ID;
        tip.setAttribute('role', 'alert');
        tip.style.cssText = 'position:fixed;z-index:100010;display:none;pointer-events:none;'
                + 'max-width:280px;padding:6px 10px;border-radius:6px;'
                + 'background:#EB5050;color:#fff;font-weight:500;'
                + 'font-size:calc(12px + var(--fs-adj,0px));line-height:18px;'
                + 'box-shadow:0 2px 8px rgba(0,0,0,.18);white-space:nowrap;'
                + 'overflow:hidden;text-overflow:ellipsis;';
        document.body.appendChild(tip);
        return tip;
    }

    function warn(el, ch) {
        var tip = warnTip();
        tip.textContent = MSG_BLOCKED + (ch ? '  ' + ch : '');
        tip.style.display = 'block';
        var r = el.getBoundingClientRect();
        var top = r.top - tip.offsetHeight - 6;
        if (top < 4) {
            top = r.bottom + 6;              /* ช่องอยู่ชิดขอบบน -> ย้ายไปใต้ช่องแทน */
        }
        var left = r.left;
        var overflow = left + tip.offsetWidth - (window.innerWidth - 8);
        if (overflow > 0) {
            left -= overflow;                /* ล้นขอบขวา -> ดันกลับเข้ามา */
        }
        tip.style.top = Math.max(4, top) + 'px';
        tip.style.left = Math.max(4, left) + 'px';
        if (warnTimer) {
            clearTimeout(warnTimer);
        }
        warnTimer = setTimeout(function () {
            tip.style.display = 'none';
        }, WARN_MS);
    }

    /* ── ตัวดัก ──────────────────────────────────────────────────────────
       2 ชั้น:
       1) beforeinput — กันตอน "พิมพ์" ไม่ให้อักขระเข้าไปเลย (ไม่มีอาการวูบ)
       2) input       — ตาข่ายกันตก สำหรับ paste / drag-drop / IME / โค้ดที่เซ็ต value เอง
                        ตัดอักขระที่หลุดมาออก แล้วคืนตำแหน่งเคอร์เซอร์ให้เท่าเดิม */
    function onBeforeInput(e) {
        var el = e.target;
        if (!isGuarded(el)) {
            return;
        }
        var type = e.inputType || '';
        if (type !== 'insertText' && type !== 'insertReplacementText') {
            return;                          /* paste/drop ปล่อยให้ชั้น input จัดการ (ตัดทิ้งเฉพาะตัวร้าย ไม่ทิ้งทั้งก้อน) */
        }
        if (!e.data) {
            return;
        }
        var ch = firstBlocked(e.data, blockedCharsOf(el));
        if (ch) {
            e.preventDefault();
            warn(el, ch);
        }
    }

    function onInput(e) {
        var el = e.target;
        if (!isGuarded(el) || e.isComposing) {
            return;                          /* ระหว่าง IME ยังประกอบคำอยู่ อย่าเพิ่งไปยุ่งกับ value */
        }
        var value = el.value;
        if (value === null || value === undefined || value === '') {
            return;
        }
        var blocked = blockedCharsOf(el);
        var ch = firstBlocked(value, blocked);
        if (!ch) {
            return;
        }
        var pos = el.selectionStart;
        var removed = countBlockedBefore(value, (pos === null || pos === undefined) ? value.length : pos, blocked);
        el.value = strip(value, blocked);
        if (pos !== null && pos !== undefined) {
            try {
                el.setSelectionRange(pos - removed, pos - removed);
            } catch (ignore) {
                /* บาง input type ไม่รองรับ selection — ข้ามไป ค่าถูกตัดแล้วเป็นพอ */
            }
        }
        warn(el, ch);
    }

    function start() {
        /* capture = true : ได้ก่อน handler ของหน้า/PrimeFaces จึงกันได้ทันก่อนค่าถูกเอาไปใช้ต่อ */
        document.addEventListener('beforeinput', onBeforeInput, true);
        document.addEventListener('input', onInput, true);
    }

    if (EXCLUDED_PAGES.indexOf(currentPageName()) > -1) {
        return;
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
