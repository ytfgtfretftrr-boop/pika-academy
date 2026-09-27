import os
import shutil

src = r"C:\皮卡學院官方網站"
destinations = [
    r"C:\Users\ytfgt\Desktop\皮卡學院官方網站",
    r"C:\Users\ytfgt\OneDrive\Desktop\皮卡學院官方網站",
    r"C:\Users\ytfgt\.gemini\antigravity\scratch"
]

files_to_sync = [
    "index.html",
    "qa.html",
    "videos.html",
    "about.html",
    "chat.html",
    "server.py",
    "pika_academy.db",
    os.path.join("js", "common.js"),
    os.path.join("js", "editor.js"),
    os.path.join("css", "style.css"),
    "README_後端說明.md"
]

for dst in destinations:
    if os.path.exists(dst):
        print(f"Syncing to {dst}...")
        for f in files_to_sync:
            src_f = os.path.join(src, f)
            dst_f = os.path.join(dst, f)
            if os.path.exists(src_f):
                os.makedirs(os.path.dirname(dst_f), exist_ok=True)
                shutil.copy2(src_f, dst_f)
                print(f"  Copied {f}")
        print(f"Successfully synced to {dst}")
    else:
        print(f"Skipping {dst} (directory does not exist)")
