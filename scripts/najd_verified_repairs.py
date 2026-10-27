"""Only structured provider configuration may reach the verified server gate."""
import json
import os
import re
import urllib.parse
import urllib.request
from pathlib import Path

FIELDS = {'primary_domain','search_path','search_parameter','search_method','card_selector','title_selector','link_selector','poster_selector','year_selector','default_type'}
BASE = 'https://matv.onrender.com'


def config_only(value):
    if not isinstance(value, dict) or not value or set(value) - FIELDS:
        raise ValueError('INVALID_CONFIG_PROPOSAL')
    if any(not isinstance(x,str) or len(x)>300 or '\n' in x or '\r' in x for x in value.values()):
        raise ValueError('INVALID_CONFIG_PROPOSAL')
    return value


def fetch_json(url, headers=None, body=None):
    request = urllib.request.Request(url, headers=headers or {}, data=None if body is None else json.dumps(body).encode())
    with urllib.request.urlopen(request,timeout=27) as response:
        data=response.read(128*1024+1)
        if len(data)>128*1024:raise ValueError('MAINTENANCE_RESPONSE_TOO_LARGE')
        return json.loads(data)


def github_identity():
    url=os.getenv('ACTIONS_ID_TOKEN_REQUEST_URL','')
    key=os.getenv('ACTIONS_ID_TOKEN_REQUEST_TOKEN','')
    parsed=urllib.parse.urlsplit(url)
    if not key or parsed.scheme!='https' or not (parsed.hostname or '').endswith('.actions.githubusercontent.com'):
        raise ValueError('OIDC_NOT_AVAILABLE')
    query=urllib.parse.parse_qs(parsed.query)
    query['audience']=['najd-maintenance']
    target=urllib.parse.urlunsplit(parsed._replace(query=urllib.parse.urlencode(query,doseq=True)))
    return fetch_json(target,{'Authorization':'Bearer '+key})['value']


def apply_verified(proposals, *, transport=fetch_json, identity=github_identity):
    if os.getenv('NAJD_AUTO_REPAIR')!='1':return []
    if not isinstance(proposals,list):return []
    selected=[]
    for item in proposals[:2]:
        try:
            if not isinstance(item,dict) or not re.fullmatch(r'[a-z0-9][a-z0-9_-]{1,29}',str(item.get('provider',''))):continue
            selected.append({'provider':item['provider'],'config':config_only(item.get('config'))})
        except ValueError:continue
    if not selected:return []
    try:
        current=transport(BASE+'/api/v1/providers/configuration')['providers']
        revisions={r['id']:r['revision'] for r in current if r.get('enabled') is not False}
        token=identity()
    except Exception:return [{'status':'not_applied','reason':'MAINTENANCE_AUTH_OR_CONFIGURATION_UNAVAILABLE'}]
    results=[]
    for item in selected:
        if item['provider'] not in revisions:continue
        try:
            result=transport(BASE+'/api/v1/maintenance/provider-config',{'Authorization':'Bearer '+token,'Content-Type':'application/json'},{**item,'expected_revision':revisions[item['provider']]})
            if result.get('applied') is not True or result.get('evidence',{}).get('positive_identity') is not True or result.get('evidence',{}).get('negative_empty') is not True:
                raise ValueError('UNVERIFIED_RESPONSE')
            results.append({'provider':item['provider'],'status':'applied','revision':result['revision'],'config':config_only(result['config']),'evidence':result['evidence']})
        except Exception:
            results.append({'provider':item['provider'],'status':'not_applied','reason':'LIVE_VERIFICATION_OR_REVISION_CHECK_FAILED'})
    return results


def observed_forms(path):
    if not path:return []
    file=Path(path)
    if file.stat().st_size>128*1024:raise ValueError('FORM_REPORT_TOO_LARGE')
    result=[]
    for row in json.loads(file.read_text()).get('providers',[])[:25]:
        try:
            if row.get('form'):result.append({'provider':row['id'],'observed_form':config_only(row['form'])})
        except ValueError:continue
    return result
