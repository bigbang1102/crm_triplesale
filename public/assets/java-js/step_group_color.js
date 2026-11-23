/*
 * step_group_color.js — สีแท็ก "กลุ่มขั้นตอน/ขั้นตอน" มาตรฐานกลาง (★ 23/09/2026)
 *
 * ใช้ร่วมกัน: แดชบอร์ด (dashboard.js — ตารางโอกาสขาย) + หน้าการติดต่อ (activity.xhtml — คอลัมน์กลุ่มขั้นตอน)
 * ตามภาพดีไซน์ "Tag Workflow / Steppers" ที่ user ส่งมา:
 *   - สี = Activity Stepper Palette (CLAUDE.md ข้อ 2) ตามตำแหน่งของกลุ่มในลำดับขั้นตอนของ movementType นั้น
 *     (total = จำนวนกลุ่มทั้งหมด, idx = ลำดับของกลุ่มนั้น) — ห้ามใช้สีนอก palette นี้
 *   - สไตล์แท็ก = พื้นอ่อน (สีเดียวกัน opacity 12%) + เส้นขอบสีเต็ม 1px + ตัวอักษรสีกลุ่ม
 *     (สีอ่อนมาก เช่น #80E8FF / #B7A4EF / #62E1B3 → ตัวอักษรเข้มขึ้นให้อ่านออกบนพื้นขาว)
 *
 * หาตำแหน่งของกลุ่มจาก master activity-groups (/board/master/activity-groups?movementTypeId=)
 * ลำดับการจับคู่: id → ชื่อ (ตัดช่องว่าง/ไม่สนตัวพิมพ์) → code (หรือตัวย่อในวงเล็บท้ายชื่อ เช่น "(CS)")
 * จับคู่ไม่ได้เลย → hash ชื่อเข้าแถว 12 สีของ palette (ยังอยู่ใน palette, ชื่อเดิมได้สีเดิมเสมอ)
 */
(function (w) {
    "use strict";

    var PALETTE = [
        ['#0C8E6A'],
        ['#0C8E6A', '#6043B6'],
        ['#0C8E6A', '#0D61CF', '#6043B6'],
        ['#0C8E6A', '#1A8FE3', '#0D61CF', '#6043B6'],
        ['#0C8E6A', '#0AA77C', '#1A8FE3', '#0D61CF', '#6043B6'],
        ['#0C8E6A', '#0AA77C', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2'],
        ['#0C8E6A', '#0AA77C', '#00C08B', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2'],
        ['#0C8E6A', '#0AA77C', '#00C08B', '#009ED0', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2'],
        ['#0C8E6A', '#0AA77C', '#00C08B', '#009ED0', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2', '#B7A4EF'],
        ['#0C8E6A', '#0AA77C', '#00C08B', '#62E1B3', '#009ED0', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2', '#B7A4EF'],
        ['#0C8E6A', '#0AA77C', '#00C08B', '#62E1B3', '#80E8FF', '#009ED0', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2', '#B7A4EF'],
        ['#0C8E6A', '#0AA77C', '#00C08B', '#62E1B3', '#80E8FF', '#1DCBF1', '#009ED0', '#1A8FE3', '#0D61CF', '#6043B6', '#7F63D2', '#B7A4EF']
    ];
    var MAX_STEPS = PALETTE.length;
    var DEFAULT_COLOR = '#0C8E6A';
    var TAG_BG_ALPHA = 0.12;
    var LIGHT_LUMINANCE = 0.55;   /* สีสว่างกว่านี้ → ตัวอักษรต้องเข้มขึ้น */
    var TEXT_DARKEN = 0.45;

    function color(total, idx) {
        var row = PALETTE[Math.min(Math.max(total, 1), MAX_STEPS) - 1];
        return row[Math.min(Math.max(idx, 0), row.length - 1)] || DEFAULT_COLOR;
    }

    function norm(s) {
        return String(s == null ? '' : s).replace(/\s+/g, '').toLowerCase();
    }
    /* ตัวย่อในวงเล็บท้ายชื่อ: "กลุ่มงานขาย (CS)" → "cs" */
    function codeInName(name) {
        var m = /\(([^()]+)\)\s*$/.exec(String(name == null ? '' : name));
        return m ? norm(m[1]) : '';
    }

    /* items = result ของ master activity-groups (เรียงซ้าย→ขวาตามที่ API ส่งมา) → {total, idToIndex, keyToIndex} | null */
    function buildMeta(items) {
        if (!items || !items.length) { return null; }
        var idToIndex = {}, keyToIndex = {};
        function addKey(k, i) { if (k && !Object.prototype.hasOwnProperty.call(keyToIndex, k)) { keyToIndex[k] = i; } }
        items.forEach(function (item, i) {
            var gid = item.id != null ? item.id : item.activityGroupId;
            if (gid != null) { idToIndex[String(gid)] = i; }
            addKey(norm(item.name), i);
            addKey(norm(item.nameTh), i);
            addKey(norm(item.nameEn), i);
            addKey(norm(item.code), i);
            addKey(codeInName(item.name), i);
        });
        return { total: items.length, idToIndex: idToIndex, keyToIndex: keyToIndex };
    }

    function indexOf(meta, id, name) {
        if (!meta) { return null; }
        if (id != null && id !== '' && id !== 0 && meta.idToIndex[String(id)] != null) {
            return meta.idToIndex[String(id)];
        }
        var byName = meta.keyToIndex[norm(name)];
        if (byName != null) { return byName; }
        var byCode = meta.keyToIndex[codeInName(name)];
        return byCode != null ? byCode : null;
    }

    function hashColor(name) {
        var s = String(name == null ? '' : name).trim();
        var row = PALETTE[MAX_STEPS - 1];
        if (!s) { return row[0]; }
        var h = 0;
        for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; }
        return row[Math.abs(h) % row.length];
    }

    /* สีของกลุ่ม: ตามตำแหน่งจริงใน meta ถ้าหาเจอ, ไม่งั้น hash ชื่อ (ยังอยู่ใน palette) */
    function resolve(meta, id, name) {
        var idx = indexOf(meta, id, name);
        return idx != null ? color(meta.total, idx) : hashColor(name);
    }

    function rgb(hex) {
        var h = String(hex || '').replace('#', '');
        return [parseInt(h.substring(0, 2), 16) || 0, parseInt(h.substring(2, 4), 16) || 0, parseInt(h.substring(4, 6), 16) || 0];
    }
    function textColor(hex) {
        var c = rgb(hex);
        var lum = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
        if (lum <= LIGHT_LUMINANCE) { return hex; }
        return 'rgb(' + c.map(function (v) { return Math.round(v * (1 - TEXT_DARKEN)); }).join(',') + ')';
    }

    /* inline style ของแท็ก (ใช้คู่กับ class .wf-tag ของแต่ละหน้า) */
    function tagStyle(hex) {
        var c = rgb(hex);
        return 'background:rgba(' + c.join(',') + ',' + TAG_BG_ALPHA + ');'
             + 'border:1px solid ' + hex + ';color:' + textColor(hex) + ';';
    }

    w.StepGroupColor = { color: color, buildMeta: buildMeta, resolve: resolve, tagStyle: tagStyle };
})(window);
