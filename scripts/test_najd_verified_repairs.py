import os
import unittest
from unittest.mock import patch
from najd_verified_repairs import apply_verified,config_only
class RepairsTest(unittest.TestCase):
 def test_disabled_mode_never_fetches(self):
  with patch.dict(os.environ,{'NAJD_AUTO_REPAIR':'0'}):
   self.assertEqual(apply_verified([{'provider':'p','config':{'search_path':'/'}}],transport=lambda *args: self.fail('network called')),[])
 def test_only_two_schema_limited_proposals_can_reach_server(self):
  requests=[]
  def transport(url,headers=None,body=None):
   requests.append((url,body))
   if body is None:return {'providers':[{'id':'fixture','revision':3,'enabled':True}]}
   return {'applied':True,'revision':4,'config':body['config'],'evidence':{'positive_identity':True,'negative_empty':True}}
  proposals=[{'provider':'fixture','config':{'search_path':'/search'}}]*4
  with patch.dict(os.environ,{'NAJD_AUTO_REPAIR':'1'}):
   result=apply_verified(proposals,transport=transport,identity=lambda:'OIDC-test')
  self.assertEqual(len(result),2)
  self.assertTrue(all(r['status']=='applied' for r in result))
  self.assertTrue(all(body['expected_revision']==3 for _,body in requests if body))
 def test_code_or_secret_fields_rejected(self):
  for value in [{'code':'run()'},{'token':'secret'},{'search_path':{'run':'x'}}]:
   with self.assertRaises(ValueError):config_only(value)
 def test_unverified_response_is_never_reported_as_applied(self):
  def transport(url,headers=None,body=None):
   if body is None:return {'providers':[{'id':'fixture','revision':0}]}
   return {'applied':True,'config':body['config']}
  with patch.dict(os.environ,{'NAJD_AUTO_REPAIR':'1'}):
   result=apply_verified([{'provider':'fixture','config':{'search_path':'/'}}],transport=transport,identity=lambda:'OIDC-test')
  self.assertEqual(result[0]['status'],'not_applied')
if __name__=='__main__':unittest.main()
