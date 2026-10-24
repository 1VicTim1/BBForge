"""Exercise the release WebKitGTK window using W3C WebDriver, not browser mocks."""
import base64
import json
import os
from pathlib import Path
import time
import urllib.request
import urllib.error

base = "http://127.0.0.1:4444"
def request(method, route, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(base + route, data=data, method=method, headers={"Content-Type": "application/json"})
    try:
        response = urllib.request.urlopen(req, timeout=45)
    except urllib.error.HTTPError as error:
        raise RuntimeError(error.read().decode()) from error
    with response:
        value = json.load(response)["value"]
        if isinstance(value, dict) and "error" in value:
            raise RuntimeError(value)
        return value

session = request("POST", "/session", {"capabilities": {"alwaysMatch": {"webkitgtk:browserOptions": {"binary": os.environ["BBFORGE_BINARY"], "args": []}}}})["sessionId"]
prefix = "/session/" + session
def js(script, *args):
    return request("POST", prefix + "/execute/sync", {"script": script, "args": list(args)})
def wait(script):
    deadline = time.monotonic() + 30
    while time.monotonic() < deadline:
        result = js(script)
        if result:
            return result
        time.sleep(.15)
    raise AssertionError("Timed out: " + script)

try:
    wait("return !!document.querySelector('.cm-content') && !!document.querySelector('.visual-text')")
    url = request("GET", prefix + "/url")
    assert ":1420" not in url, url
    js("window.__smokeOriginal= document.querySelector('.cm-content').innerText; return true")
    # Native IPC has already parsed the example, producing these editable leaves.
    js("const e=document.querySelector('.visual-text'); e.focus(); e.textContent='Нативный тест 😀'; e.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText'})); return true")
    wait("return document.querySelector('.cm-content').innerText.includes('Нативный тест 😀')")
    wait("return document.querySelector('.sync-state').textContent.includes('Синхронизирован')")
    # A structural command also needs the source snapshot carried across IPC.
    js("Array.from(document.querySelectorAll('[role=treeitem]')).find(e=>e.textContent.includes('Важная информация')).click(); return true")
    wait("return !!document.querySelector('[aria-label=\"Заголовок спойлера\"]')")
    js("const e=document.querySelector('[aria-label=\"Заголовок спойлера\"]'); const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set; setter.call(e,'Native title'); e.dispatchEvent(new Event('input',{bubbles:true})); return true")
    js("document.querySelector('.properties form').requestSubmit(); return true")
    wait("return document.querySelector('.cm-content').innerText.includes('Native title')")
    # Ask the real Rust backend to diagnose malformed code through Tauri IPC.
    result = request("POST", prefix + "/execute/async", {"script": "const done=arguments[arguments.length-1]; window.__TAURI_INTERNALS__.invoke('analyze',{source:'[b]',documentId:'smoke',revision:1}).then(done).catch(e=>done({error:String(e)}));", "args": []})
    assert any(item["code"] == "unclosedTag" for item in result["analysis"]["diagnostics"]), result
    bad = js("return performance.getEntriesByType('resource').filter(e=>e.name.includes('localhost:1420')).map(e=>e.name)")
    assert not bad, bad
    artifact = Path(os.environ.get("BBFORGE_ARTIFACTS", "artifacts"))
    artifact.mkdir(exist_ok=True)
    image = request("GET", prefix + "/screenshot")
    (artifact / "bbforge-native-smoke.png").write_bytes(base64.b64decode(image))
    report = {"passed": True, "url": url, "real_rust_ipc": True, "visual_to_code": True, "structural_command": True, "dev_server_requests": bad}
    (artifact / "native-smoke.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps(report, ensure_ascii=False))
finally:
    request("DELETE", prefix)
