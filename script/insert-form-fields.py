from pathlib import Path

insert = Path("client/src/pages/_form_insert.txt").read_text(encoding="utf-8")
path = Path("client/src/pages/CreateMusic.tsx")
text = path.read_text(encoding="utf-8")
needle = (
    "                      </div>\n\n"
    "                                            <div>\n\n"
    '                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">'
)
replacement = (
    "                      </div>\n\n"
    + insert
    + "\n                      <div>\n\n"
    '                        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">'
)
if needle not in text:
    raise SystemExit("needle not found")
path.write_text(text.replace(needle, replacement, 1), encoding="utf-8", newline="\n")
print("inserted")
