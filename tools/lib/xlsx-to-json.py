"""
xlsx-to-json.py <book.xlsx> <out.json>

Writes every sheet of a workbook as { "<sheet>": [[cell, ...], ...] } (the first row = the header). Dates become ISO text; empty cells are null.
Used by tools/mockup-import-workbook.mjs (Node has no workbook reader in this project). Run it as `python -I -X utf8 tools/lib/xlsx-to-json.py in.xlsx out.json`.
Needs `openpyxl` (pip install openpyxl).
"""
import datetime
import json
import sys

import openpyxl


def cell(value):
    if isinstance(value, (datetime.datetime, datetime.date)):
        return value.isoformat()
    return value


def main(source, target):
    book = openpyxl.load_workbook(source, read_only=True, data_only=True)
    sheets = {ws.title: [[cell(c) for c in row] for row in ws.iter_rows(values_only=True)] for ws in book.worksheets}
    with open(target, "w", encoding="utf-8") as out:
        json.dump(sheets, out, ensure_ascii=False)
    print(target, {name: len(rows) for name, rows in sheets.items()})


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
