"""Capture the current production renderer using synthetic data, never personal state.
Serve dist on 127.0.0.1:8766 before running this script with python3.
Requires Playwright + Chromium. Does not connect to Electron or any model endpoint.
"""
from pathlib import Path
import json
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
const zh = LOCALE === 'zh-CN';
localStorage.setItem('better-skill-recorder.language', LOCALE);
localStorage.setItem('better-skill-recorder.theme', THEME);
const titles = zh ? ['整理每周项目进展', '收集产品对比资料', '演示新员工入职流程'] : ['Prepare a weekly project update', 'Compare product options', 'Walk through employee onboarding'];
const intents = zh ? ['将项目看板中的进展整理为周报，检查后分享给团队', '收集三个产品的公开信息，整理功能与价格对比'] : ['Turn project board updates into a weekly report, review it, and share with the team', 'Collect public information about three products and compare features and pricing'];
const steps = zh ? [['打开项目看板', '筛选本周已完成和进行中的任务', '整理周报草稿', '检查并分享给团队'], ['打开产品官方网站', '记录功能和价格', '整理对比表格', '检查来源链接']] : [['Open the project board', 'Filter completed and in-progress tasks', 'Draft the weekly update', 'Review and share with the team'], ['Open official product websites', 'Note features and pricing', 'Build a comparison table', 'Check source links']];
const analyses = {};
values.listSessions = titles.map((title, i) => {
 const id = 'demo-session-' + i, startedAt = Date.UTC(2026,8,8,2-i);
 const analysis = i < 2 ? {version:1,sessionId:id,revision:1,createdAt:startedAt+360000,narrationSourceUpdatedAt:null,title,intent:intents[i],intentConfidence:'high',intentRationale:zh?'根据演示操作与旁白整理':'Based on the example actions and narration',steps:steps[i].map((title,j)=>({id:'step-'+j,title,detail:zh?'演示步骤：确认所需信息后继续下一步':'Example step: check the relevant information before continuing',startMs:j*40000,endMs:(j+1)*40000,apps:['Browser'],evidence:[],confidence:'high'})),feedbackLog:[],approved:false} : null;
 analyses[id] = analysis;
 return {id,startedAt,stoppedAt:startedAt+210000,durationMs:210000,sizeBytes:12582912,processed:true,hasVideo:true,hasAudio:false,narrationLanguage:zh?'zh':'en',hasNarration:false,narrationSegmentCount:0,narrationUpdatedAt:null,hasSkill:false,hasAutomation:false,analysis:analysis?{...analysis,stepCount:4}:null};
});
window.skillRecorder = new Proxy({}, {get:(_,key) => key.startsWith('on') ? () => () => {} : (...args) => Promise.resolve(key==='getAnalysis'?analyses[args[0]]:key==='getSensitiveReport'?null:values[key] ?? {ok:true})});
})();"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    errors = []
    for locale in ['en', 'zh-CN']:
        out = ROOT / 'docs/images' / locale
        out.mkdir(exist_ok=True)
        for theme in ['light', 'dark']:
            page = browser.new_page(viewport={"width":480,"height":620}, device_scale_factor=1.5)
            page.on('pageerror', lambda err: errors.append(str(err)))
            page.add_init_script('const LOCALE='+json.dumps(locale)+';const THEME='+json.dumps(theme)+';'+MOCK)
            page.goto('http://127.0.0.1:8766/#recorder', wait_until='networkidle')
            hud = page.locator('.hud').bounding_box()
            page.set_viewport_size({"width":480,"height":round(hud['y']+hud['height']+8)})
            page.screenshot(path=str(out / f'recorder-{theme}.png'), full_page=True)
            page.set_viewport_size({"width":1280,"height":960})
            page.goto('http://127.0.0.1:8766/#library', wait_until='networkidle')
            page.reload(wait_until='networkidle')
            assert not errors, errors
            if not page.locator('.ws-body').count():
                print(page.locator('body').inner_text(), flush=True)
            page.locator('.ws-body').wait_for()
            page.wait_for_timeout(300)
            assert page.get_by_text('打开项目看板' if locale=='zh-CN' else 'Open the project board', exact=True).count(), page.locator('body').inner_text()
            page.screenshot(path=str(out / f'library-{theme}.png'), full_page=True)
            page.get_by_text('收集产品对比资料' if locale=='zh-CN' else 'Compare product options', exact=True).click()
            page.get_by_text('打开产品官方网站' if locale=='zh-CN' else 'Open official product websites', exact=True).wait_for()
            page.screenshot(path=str(out / f'library-example-{theme}.png'), full_page=True)
            page.get_by_role('button', name='模型管理' if locale=='zh-CN' else 'Model management').click()
            page.get_by_text('BaseURL', exact=True).wait_for()
            page.screenshot(path=str(out / f'model-management-{theme}.png'), full_page=True)
            page.get_by_role('button', name='高级设置' if locale=='zh-CN' else 'Advanced settings').click()
            page.locator('#recording-shortcut').wait_for()
            page.screenshot(path=str(out / f'advanced-settings-{theme}.png'), full_page=True)
            page.close()
            print(f'Captured {locale} / {theme}: five pages', flush=True)
    assert not errors, errors
    browser.close()
print('Captured twenty localized screenshots with synthetic, non-secret data')
