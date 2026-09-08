"""Capture the current production renderer using synthetic data, never personal state.
Serve dist on 127.0.0.1:8766 before running this script with python3.
Requires Playwright + Chromium. Does not connect to Electron or any model endpoint.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
MOCK = """(() => {
localStorage.setItem('better-skill-recorder.language', 'en');
localStorage.setItem('better-skill-recorder.theme', 'light');
const settings = {provider:'openai-compatible', model:'qwen3.7-plus', baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1', vision:true, modelPresets:[{id:'qwen3.7-plus',label:'Qwen 3.7 Plus',baseUrl:'https://dashscope.aliyuncs.com/compatible-mode/v1',tokenPlanBaseUrl:'https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1'}], hasApiKey:false,apiKeySource:'none',secureStorageAvailable:true,configPath:'',configured:true,environmentOverrides:[]};
const values = {
  agentSettings: settings, listSessions: [],
  appSettings: {minimumRecordingSeconds:5, maximumAudioMB:100, recordingShortcut:'Alt+Shift+R',recordingRetentionDays:30},
  shortcutStatus:true,
  status:{state:'idle',sessionId:null,startedAt:null,narrationLanguage:'en',eventCount:0,transition:'none',microphone:{state:'off',error:null,activeDevice:null},lastFinish:null,lastSession:null},
  narrationStatus:{model:'ready',phase:'idle',progress:null,loadedBytes:null,totalBytes:null,activeSessionId:null,error:null},
  sensitiveModelStatus:{enabled:true,ocr:'ready',progress:null,error:null},
  microphoneSettings:{narrationEnabled:false,permission:'granted',devices:[],preferredDeviceId:'default',preferredDeviceLabel:'Built-in Microphone',selectedDeviceId:'default',selectedDeviceLabel:'Built-in Microphone',preferredDeviceUnavailable:false,fallback:null,error:null},
  screenSettings:{screens:[{id:'screen:demo',label:'Built-in Retina Display',displayId:'demo'}],preferredSourceId:'screen:demo',preferredSourceLabel:'Built-in Retina Display',selectedSourceId:'screen:demo',selectedSourceLabel:'Built-in Retina Display',preferredSourceUnavailable:false,fallback:null,error:null}
};
window.skillRecorder = new Proxy({}, {get:(_,key) => key.startsWith('on') ? () => () => {} : () => Promise.resolve(values[key] ?? {ok:true})});
})();"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 480, "height": 620}, device_scale_factor=2)
    errors = []
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.add_init_script(MOCK)
    page.goto('http://127.0.0.1:8766/#recorder', wait_until='networkidle')
    hud = page.locator('.hud').bounding_box()
    page.set_viewport_size({"width": 480, "height": round(hud['y'] + hud['height'] + 8)})
    page.screenshot(path=str(ROOT / 'docs/images/recorder.png'), full_page=True)
    page.set_viewport_size({"width": 1280, "height": 900})
    page.goto('http://127.0.0.1:8766/#library', wait_until='networkidle')
    page.reload(wait_until='networkidle')
    page.screenshot(path=str(ROOT / 'docs/images/library.png'), full_page=True)
    page.get_by_role('button', name='Model management').click()
    page.get_by_text('BaseURL', exact=True).wait_for()
    page.screenshot(path=str(ROOT / 'docs/images/model-management.png'), full_page=True)
    page.get_by_role('button', name='Advanced settings').click()
    page.locator('#recording-shortcut').wait_for()
    page.screenshot(path=str(ROOT / 'docs/images/advanced-settings.png'), full_page=True)
    assert not errors, errors
    browser.close()
print('Captured four current-renderer screenshots with synthetic, non-secret data')
