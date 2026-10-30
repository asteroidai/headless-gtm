# Production on an always-on box

Any always-on machine works: a Mac mini in the office, a small VPS, a home server. This guide uses a Mac mini with launchd. On Linux use systemd units with the same commands.

The shape:

- The server listens on `localhost:5005`. No open ports.
- A named Cloudflare Tunnel exposes two hostnames:
  - `webhooks.yourco.com` is public and only forwards `/webhooks/*`. Each integration verifies its own secret.
  - `gtm.yourco.com` is the dashboard and admin API, behind Cloudflare Access (email OTP for people, a service token for scripts).
- launchd keeps the server and the tunnel alive and starts them at boot.
- Updates happen without SSH: a deploy job pulls `main`, installs and restarts. The server posts a boot message to Slack with the commit SHA.

## 1. Prepare the box

```sh
brew install node pnpm cloudflared
npm install -g @anthropic-ai/claude-code
git clone https://github.com/asteroidai/headless-ops ~/headless-ops
cd ~/headless-ops && pnpm install
cp .env.example .env
```

Fill `.env`. Set `ADMIN_TOKEN` to a long random string. For Claude, use a long-lived token: run `claude setup-token` on any laptop and put the result in `CLAUDE_CODE_OAUTH_TOKEN`. A browser login on the box expires after a while and every job then fails with "OAuth session expired".

Check it runs: `pnpm start`, then `curl localhost:5005/healthz`. Stop it.

## 2. The tunnel

In Cloudflare Zero Trust: Networks, Tunnels, Create a tunnel. Name it `gtm`. Copy the token.

```sh
sudo cloudflared service install <TOKEN>
```

Add two public hostnames to the tunnel, both to `http://localhost:5005`:

| hostname | path | notes |
|---|---|---|
| `webhooks.yourco.com` | `^/webhooks/` | public |
| `gtm.yourco.com` | (all) | protect with Access, next step |

Other paths on `webhooks.yourco.com` 404 at the edge. `deploy/cloudflared-config.yml` shows the same as a config file if you prefer a locally managed tunnel.

## 3. Access on the dashboard host

Zero Trust, Access, Applications, Add, Self-hosted. Domain `gtm.yourco.com`. Two policies:

1. Allow, emails ending in `@yourco.com`, with the One-time PIN login method.
2. Service Auth, for a service token you create under Access, Service Auth. Scripts send `CF-Access-Client-Id` and `CF-Access-Client-Secret` headers.

`ADMIN_TOKEN` still applies behind Access. Two locks, one key each. The dashboard asks for it as a password.

Point the CLI at production from a laptop:

```sh
GTM_URL=https://gtm.yourco.com ADMIN_TOKEN=... pnpm gtm jobs
```

(The CLI does not add the CF Access headers. Add them with `curl` or put the laptop's IP in an Access bypass policy.)

## 4. launchd

Templates are in `deploy/`. Edit the paths, then:

```sh
sed "s|__HOME__|$HOME|g" deploy/com.yourco.headless-ops.plist > ~/Library/LaunchAgents/com.yourco.headless-ops.plist
launchctl load -w ~/Library/LaunchAgents/com.yourco.headless-ops.plist
sleep 3 && curl -fsS localhost:5005/healthz
```

Logs: `~/Library/Logs/headless-ops.log`. `KeepAlive` restarts it on a crash; `RunAtLoad` starts it at login. Enable automatic login for the user so a reboot comes back without a keyboard.

The tunnel was installed as a system service in step 2 and needs no plist.

## 5. Update without SSH

`deploy/deploy.sh` fetches `origin/main`, and when the SHA changed, pulls, installs, runs `pnpm typecheck`, and restarts the server service. `deploy/com.yourco.headless-ops.deploy.plist` runs it every five minutes.

```sh
sed "s|__HOME__|$HOME|g" deploy/com.yourco.headless-ops.deploy.plist > ~/Library/LaunchAgents/com.yourco.headless-ops.deploy.plist
launchctl load -w ~/Library/LaunchAgents/com.yourco.headless-ops.deploy.plist
```

So the loop is: merge to `main`, wait five minutes, watch Slack for "headless-ops booted at <sha>". No merge, no restart.

A restart marks any job that was running as `failed: interrupted by restart`. It does not re-run it. Fire the webhook again if you need it.

## 6. Rotate the Claude login remotely

When jobs fail with "OAuth session expired" or "Failed to authenticate":

```sh
claude setup-token                        # on your laptop; prints sk-ant-oat01-...
curl -X POST https://gtm.yourco.com/admin/claude-auth \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "CF-Access-Client-Id: ..." -H "CF-Access-Client-Secret: ..." \
  -H 'Content-Type: application/json' -d '{"token":"sk-ant-oat01-..."}'
```

The server writes the token to `.env`, sets it on the running process, and answers with a probe result. The next job uses it. Nothing needs a restart. `GET /admin/claude-auth` shows the current mode and whether `claude` answers.

## 7. Troubleshooting

| symptom | usual cause |
|---|---|
| Tunnel returns 502 | The server is down. `launchctl list \| grep headless-ops`, then read `~/Library/Logs/headless-ops.log`. |
| Webhook returns 401 | Wrong secret, or the secret is unset (integrations fail closed). |
| Webhook returns 404 | The integration is not in `gtm.config.yaml`, or the path is not `/webhooks/<name>`. |
| Job `failed: could not spawn claude` | `claude` is not on launchd's PATH. Set `CLAUDE_BIN` in `.env` to the full path. |
| Job `failed: OAuth session expired` | Step 6. |
| Job `failed: killed on timeout` | Raise `claude.timeout_minutes`, or make the skill do less. Read `data/jobs/<id>.log`. |
| Writes fail with 401 or 403 | An API key in `.env` is missing or lacks scope. The job is still `done`; the `writes` list shows the error. |
| Many jobs wait | `claude.concurrency` is low, or the subscription is rate-limited. `GET /healthz` shows the pool. |

Everything the server knows is in `data/`: `jobs.json`, `jobs/<id>.log`, `drafts/`, `signals.jsonl`, `state/<pull>.json`. Back it up if you care about history.
