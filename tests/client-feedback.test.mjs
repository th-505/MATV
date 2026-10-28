import test from'node:test';import assert from'node:assert/strict';import{parsePlaybackFeedback,clientDiagnosticContext}from'../server/diagnostics/client-feedback.mjs';
test('device failure diagnostics retain client version and exact source numbers while discarding raw errors and credentials',()=>{
 const ref='source:3cktv:'+'a'.repeat(24)+':s5:e37';const result=parsePlaybackFeedback({ref,provider:'3cktv',phase:'playback',code:'NATIVE_DECODER_ERROR',client_version:'1.1.6',client_build:106,platform:'tv',native_error:'secret https://cdn.example/signed.mp4?token=private',headers:{Cookie:'private'},authorization:'private'});
 assert.equal(result.work_ref,ref.split(':s5:')[0]);assert.equal(result.details.episode,37);assert.equal(result.details.season,5);assert.equal(result.details.client_version,'1.1.6');assert.equal(result.reason,'NATIVE_DECODER_ERROR');assert(!JSON.stringify(result).includes('private'));assert(!JSON.stringify(result).includes('https:'));assert(!('native_error'in result));
});
test('feedback cannot become an arbitrary URL logger and has only bounded public enums',()=>{
 assert.throws(()=>parsePlaybackFeedback({ref:'https://127.0.0.1/private',code:'NATIVE_DECODER_ERROR'}));assert.throws(()=>parsePlaybackFeedback({ref:'tmdb:tv:34587',code:'raw error token=secret'}));
 const result=parsePlaybackFeedback({ref:'tmdb:tv:34587',provider:'sb_secret_short_key',phase:'secret',code:'BUFFER_STALLED',platform:'secret',client_version:'secret',client_build:'secret'});assert.equal(result.provider,'unknown');assert.equal(result.details.client_version,null);assert.equal(result.details.platform,'unknown');assert.equal(result.details.phase,'playback');
 assert.equal(clientDiagnosticContext({client_version:'1.1.7',client_build:'107'}).client_build,107);
});
