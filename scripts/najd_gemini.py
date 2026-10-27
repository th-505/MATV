"""Bounded Gemini maintenance client. Never put keys in URLs, reports or prompts."""
import json
import os
import re
import urllib.error
import urllib.request

class GeminiUnavailable(RuntimeError):
    pass

class GeminiClient:
    def __init__(self, keys=None, transport=None):
        values = keys if keys is not None else [os.getenv('GEMINI_API_KEY',''),os.getenv('GEMINI_API_KEY_BACKUP','')]
        self.keys = list(dict.fromkeys(x.strip() for x in values if x.strip()))
        self.transport = transport or self._request
        self.events = []
        self.selected = None

    @staticmethod
    def _request(url, key, body=None):
        req = urllib.request.Request(url, data=None if body is None else json.dumps(body).encode(), headers={'x-goog-api-key':key,'Content-Type':'application/json'})
        with urllib.request.urlopen(req,timeout=25) as response:
            raw=response.read(256*1024+1)
            if len(raw)>256*1024:raise GeminiUnavailable('GEMINI_RESPONSE_TOO_LARGE')
            return json.loads(raw)

    def _call(self, version, path, key, body=None):
        url='https://generativelanguage.googleapis.com/'+version+'/'+path
        try:
            result=self.transport(url,key,body)
            self.events.append({'stage':'list_models' if body is None else 'generate','version':version,'status':200})
            return result
        except urllib.error.HTTPError as error:
            event={'stage':'list_models' if body is None else 'generate','version':version,'status':error.code}
            try:
                detail=json.loads(error.read(65536)).get('error',{})
                event['reason']=str(detail.get('status','HTTP_ERROR'))[:80]
                message=str(detail.get('message',''))
                for secret in self.keys:message=message.replace(secret,'[redacted]')
                event['message']=message[:200]
            except Exception:pass
            self.events.append(event)
            raise GeminiUnavailable('GEMINI_HTTP_'+str(error.code)) from None

    @staticmethod
    def _rank(model):
        n=model['name'];version=re.search(r'gemini-(\d+(?:\.\d+)?)',n)
        return ('flash-lite' in n,'flash' in n,not bool(re.search(r'preview|exp|latest',n)),float(version[1]) if version else 0)

    def generate(self, text, max_tokens=1200, json_output=True):
        if not self.keys:raise GeminiUnavailable('GEMINI_NOT_CONFIGURED')
        if len(text)>18000:raise GeminiUnavailable('GEMINI_INPUT_TOO_LARGE')
        body={'contents':[{'parts':[{'text':text}]}],'generationConfig':{'maxOutputTokens':min(1600,max(16,max_tokens)),'temperature':0}}
        if json_output:body['generationConfig']['responseMimeType']='application/json'
        candidates=[]
        if self.selected:candidates=[self.selected]
        else:
            for key in self.keys:
                for version in ['v1beta','v1']:
                    try:
                        data=self._call(version,'models',key)
                        models=[m for m in data.get('models',[]) if 'generateContent' in m.get('supportedGenerationMethods',[]) and re.fullmatch(r'models/[A-Za-z0-9._-]{1,100}',str(m.get('name',''))) and 'flash' in m['name']]
                        candidates.extend((version,m['name'],key) for m in sorted(models,key=self._rank,reverse=True)[:3])
                        if models:break
                    except (GeminiUnavailable,TimeoutError,OSError):continue
        for version,model,key in candidates[:6]:
            try:
                result=self._call(version,model+':generateContent',key,body)
                output=''.join(p.get('text','') for c in result.get('candidates',[])[:1] for p in c.get('content',{}).get('parts',[]))
                if not output:continue
                self.selected=(version,model,key)
                return {'text':output,'model':model,'usage':result.get('usageMetadata',{})}
            except (GeminiUnavailable,TimeoutError,OSError):continue
        raise GeminiUnavailable('GEMINI_NO_WORKING_MODEL')

if __name__=='__main__':
    client=GeminiClient()
    report={'configured':{'GEMINI_API_KEY':bool(os.getenv('GEMINI_API_KEY')),'GEMINI_API_KEY_BACKUP':bool(os.getenv('GEMINI_API_KEY_BACKUP'))}}
    for name in ['SMTP_HOST','SMTP_USER','SMTP_USERNAME','SMTP_PASSWORD','EMAIL_PASSWORD','MAIL_PASSWORD','EMAIL_USER','EMAIL_TO','NAJD_ALERT_EMAIL']:report['configured'][name]=bool(os.getenv(name))
    try:
        result=client.generate('Reply with the single word READY.',max_tokens=16,json_output=False)
        report.update(gemini_ready=bool(result['text']),model=result['model'],usage=result['usage'])
    except Exception as error:report.update(gemini_ready=False,reason=str(error)[:80])
    report['events']=client.events
    print(json.dumps(report,indent=2))
