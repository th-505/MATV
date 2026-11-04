import test from 'node:test';import assert from 'node:assert/strict';
import{sourceEpisodeEvidence}from'../server/scrapers/shared/source-episode-evidence.mjs';
import{scanEpisodeIndex}from'../server/harvest/episode-index.mjs';
const base='https://brstejj.pics',source=base+'/video.php?vid=actual19',parent=base+'/series1.php?id=series';const ref=url=>'brstej:'+Buffer.from(url).toString('base64url');
test('an episode returned as parent details obtains numbering only from its actual observed source row',()=>{
 const details={sourceUrl:parent,requested_source_ref:ref(source),observed_parent_ref:ref(parent),episodes:[{ref:ref(source),season:2,number:19}]};
 assert.deepEqual(sourceEpisodeEvidence(details,ref(source),['brstejj.pics']),{season_number:2,episode_number:19});
 assert.equal(sourceEpisodeEvidence({...details,requested_source_ref:ref(base+'/video.php?vid=actual20')},ref(source),['brstejj.pics']),null);
 assert.equal(sourceEpisodeEvidence({...details,episodes:[{ref:ref(base+'/video.php?vid=actual20'),season:2,number:19}]},ref(source),['brstejj.pics']),null);
});
test('encoded provider references are decoded as URLs rather than appended as relative paths',()=>{
 const index=scanEpisodeIndex('<h1>Series</h1>',parent,{provider:'brstej',domains:['brstejj.pics'],title:'Series',episodes:[{ref:ref(source),number:19,season:2,title:'الحلقة 19'}]});
 assert.equal(index.episodes[0].url,source);assert.equal(index.episodes[0].episode,19);
});
