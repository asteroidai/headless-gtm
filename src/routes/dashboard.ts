import { Hono } from "hono";
import { listDrafts } from "../drafts.ts";
import { disabledIntegrations, enabledIntegrations } from "../integrations.ts";
import { listJobs } from "../jobs.ts";
import { poolStatus } from "../queue.ts";

/** One page: what ran, what is running, what waits for a human. */
export function dashboardRoutes(): Hono {
  const app = new Hono();
  app.get("/", (c) => {
    const jobs = listJobs(50);
    const drafts = listDrafts();
    const pool = poolStatus();
    const rows = jobs
      .map(
        (j) => `<tr class="${j.status}">
  <td>${esc(j.createdAt.slice(0, 16).replace("T", " "))}</td>
  <td><code>/${esc(j.skill)}</code></td>
  <td>${esc(j.status)}</td>
  <td>${esc(j.signal?.event ?? "")}</td>
  <td>${esc(j.summary ?? j.error ?? "").slice(0, 160)}</td>
  <td><a href="/jobs/${j.id}">json</a> <a href="/jobs/${j.id}/log">log</a></td>
</tr>`,
      )
      .join("\n");
    const draftRows = drafts
      .slice(0, 20)
      .map((d) => `<li><b>${esc(d.kind)}</b> ${esc(d.to ?? "")} ${esc(d.subject ?? "")} <a href="/drafts/${d.id}">open</a></li>`)
      .join("\n");
    const names = [
      ...enabledIntegrations().map((i) => `<code>${esc(i.manifest.name)}</code>`),
      ...disabledIntegrations().map((d) => `<code class="off">${esc(d.name)}</code> (disabled: missing ${esc(d.missing.join(", "))})`),
    ].join(" ");
    return c.html(`<!doctype html>
<meta charset="utf-8"><title>headless-gtm</title>
<style>
body{font:14px system-ui;margin:2rem;max-width:1100px;color:#222}
table{border-collapse:collapse;width:100%}td,th{padding:.35rem .5rem;border-bottom:1px solid #ddd;text-align:left;vertical-align:top}
tr.running td:nth-child(3){color:#b7791f}tr.failed td:nth-child(3){color:#c53030}tr.done td:nth-child(3){color:#2f855a}
code{background:#f3f3f3;padding:0 .3rem}code.off{color:#c53030}
</style>
<h1>headless-gtm</h1>
<p>Agents: ${pool.active}/${pool.limit} running, ${pool.waiting} waiting. Integrations: ${names || "none"}.</p>
<h2>Drafts waiting for review (${drafts.length})</h2>
<ul>${draftRows || "<li>none</li>"}</ul>
<h2>Jobs</h2>
<table><tr><th>when</th><th>skill</th><th>status</th><th>event</th><th>result</th><th></th></tr>${rows}</table>`);
  });
  return app;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]!);
}
