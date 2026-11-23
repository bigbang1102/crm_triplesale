/**
 * Dev-server proxy table: everything of proxy.conf.json, plus the AI HUB stand-in for the Java servlet
 * (tools/aihub-dev-proxy.cjs), and — when MOCKUP_REMOTE_URL is set — the mockup paths (/mockup-api …) pointed at the shared file server
 * (tools/mockup-remote-proxy.cjs). It needs AIHUB_SERVICE_BASE and AIHUB_API_KEY: from the environment, or from the git-ignored
 * file `.env.aihub.local` at the project root. Without them it answers 503.
 */
const path = require('node:path');
const { aihubProxy, loadLocalEnv, PREFIX } = require('./tools/aihub-dev-proxy.cjs');
const { applyMockupRemote } = require('./tools/mockup-remote-proxy.cjs');

loadLocalEnv(path.join(__dirname, '.env.aihub.local'));
// the shared file server (Datasource + Storage of every developer, in Docker): MOCKUP_REMOTE_URL + MOCKUP_TOKEN (+ MOCKUP_WORKSPACE) — see MOCKUP.md
loadLocalEnv(path.join(__dirname, '.env.mockup.local'));

module.exports = applyMockupRemote({ ...require('./proxy.conf.json'), [PREFIX]: aihubProxy() });
