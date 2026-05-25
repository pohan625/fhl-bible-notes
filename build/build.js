// Inject data.json into template.html and produce the final offline app.
const fs = require('fs');
const path = require('path');

const templatePath = path.join(__dirname, 'template.html');
const dataPath = path.join(__dirname, 'data.json');
const outputPath = path.join(__dirname, '..', 'public', 'index.html');

const template = fs.readFileSync(templatePath, 'utf8');
const data = fs.readFileSync(dataPath, 'utf8');

if (!template.includes('__BIBLE_DATA__')) {
  console.error('template.html is missing the __BIBLE_DATA__ placeholder');
  process.exit(1);
}
if (!template.includes('__POSTHOG_SNIPPET__')) {
  console.error('template.html is missing the __POSTHOG_SNIPPET__ placeholder');
  process.exit(1);
}

const posthogKey = process.env.POSTHOG_KEY || process.env.POSTHOG_PROJECT_API_KEY || '';
const posthogHost = process.env.POSTHOG_HOST || 'https://us.i.posthog.com';
const posthogSnippet = posthogKey ? `<script>
!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
posthog.init(${JSON.stringify(posthogKey)}, {
  api_host: ${JSON.stringify(posthogHost)},
  defaults: '2026-01-30',
  capture_pageview: false
});
</script>` : '';

// `data.json` is already valid JSON, which is also a valid JS expression.
// Inject as-is — no JSON.parse round-trip is needed at runtime.
const html = template
  .replace('__POSTHOG_SNIPPET__', () => posthogSnippet)
  .replace('__BIBLE_DATA__', () => data);

fs.writeFileSync(outputPath, html);
const size = fs.statSync(outputPath).size;
console.log('Wrote ' + outputPath + ' (' + (size / 1024 / 1024).toFixed(2) + ' MB)');
