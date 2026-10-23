import sys, json, base64, subprocess, time, os
from playwright.sync_api import sync_playwright
S=sys.argv[1]; jobs=json.loads(sys.argv[2])
srv=subprocess.Popen(["python3","-m","http.server","8893"],cwd=S,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL); time.sleep(1)
try:
  with sync_playwright() as p:
    b=p.chromium.launch(args=["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
    pg=b.new_page(); errs=[]; pg.on("console", lambda m: errs.append(m.text) if m.type=="error" else None); pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8893/render.html"); pg.wait_for_function("window.ready===true", timeout=30000)
    print(pg.evaluate("u => listClips(u)", jobs[0][1]["url"]))
    for out,opts in jobs:
      t=time.time(); d=pg.evaluate("o=>renderSheet(o)", opts)
      open(out,"wb").write(base64.b64decode(d.split(",")[1])); print("ok",out,round(time.time()-t,1),"s")
    print("errs",errs[:3])
finally: srv.kill()
