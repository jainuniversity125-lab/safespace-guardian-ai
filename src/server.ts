import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

import { fromWebHandler } from "h3";
import { createStartHandler, defaultRenderHandler } from "@tanstack/react-start/server";

const startHandler = createStartHandler(defaultRenderHandler);

async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

async function handleFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);

  // ─── Health Check / Status ──────────────────────────────────
  if (url.pathname === "/api/realtime-status") {
    return new Response(JSON.stringify({
      ok: true,
      status: "operational",
      endpoints: {
        webhook: "/api/webhook",
        supabase_webhook: "/api/webhook/supabase",
        realtime_status: "/api/realtime-status",
      },
      timestamp: new Date().toISOString(),
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  // ─── CORS preflight for all API routes ──────────────────────
  if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Webhook-Secret",
        "Access-Control-Max-Age": "86400",
      }
    });
  }

  // ─── Main Webhook Endpoint (External Platforms) ─────────────
  if (url.pathname === "/api/webhook") {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
    try {
      const data = await request.json();
      const { sourceId, authorHandle, targetHandle, body, externalId } = data;
      if (!sourceId || !authorHandle || !body) {
        return new Response(JSON.stringify({ error: "Missing required fields: sourceId, authorHandle, body" }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      const { supabaseAdmin } = await import("./integrations/supabase/client.server");
      const { classifyText, sanitizeText } = await import("./lib/analysis.server");

      // Log webhook event
      await Promise.resolve(supabaseAdmin.from("webhook_events").insert({
        source_id: sourceId,
        event_type: "message",
        payload: data,
        status: "processing",
      })).catch(() => {}); // Non-blocking

      const { data: source, error: srcErr } = await supabaseAdmin
        .from("ingest_sources")
        .select("id, name, platform, event_count, active, created_by")
        .eq("id", sourceId)
        .maybeSingle();

      if (srcErr || !source) {
        return new Response(JSON.stringify({ error: "Ingestion source not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      const analysis = await classifyText(body, {
        senderRecentMessages: 0,
        messagesToSameTarget: 0,
        priorConfirmedIncidents: 0,
        targetHasBlockedSender: false,
      });

      const { data: post, error: postErr } = await supabaseAdmin
        .from("ingested_posts")
        .insert({
          source_id: source.id,
          platform: source.platform,
          external_id: externalId || `webhook_${Math.random().toString(36).substring(2, 9)}`,
          author_handle: authorHandle,
          target_handle: targetHandle || null,
          body: sanitizeText(body),
          language: analysis.language,
          labels: analysis.labels as any,
          explanation: analysis.explanation as any,
          severity: analysis.severity as any,
          confidence: analysis.confidence,
          final_risk: analysis.final_risk,
          recommended_action: analysis.recommended_action,
          requires_review: analysis.requires_review,
          status: "new",
          model_version: analysis.model_version,
        })
        .select("*")
        .single();

      if (postErr) {
        return new Response(JSON.stringify({ error: postErr.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      await supabaseAdmin
        .from("ingest_sources")
        .update({
          event_count: (source.event_count ?? 0) + 1,
          last_event_at: new Date().toISOString(),
        })
        .eq("id", source.id);

      if (analysis.requires_review && ["medium", "high", "critical"].includes(analysis.severity)) {
        await Promise.resolve(supabaseAdmin.from("realtime_alerts").insert({
          alert_type: analysis.severity === "critical" ? "threat_detected"
            : analysis.severity === "high" ? "harassment_detected"
            : "abuse_detected",
          severity: analysis.severity,
          post_id: post.id,
          source_platform: source.platform,
          author_handle: authorHandle,
          target_handle: targetHandle || null,
          message_preview: sanitizeText(body).slice(0, 200),
          ai_labels: analysis.labels,
          ai_confidence: analysis.confidence,
          final_risk: analysis.final_risk,
          explanation: analysis.explanation,
        })).catch(() => {});
      }

      if (analysis.requires_review && source.created_by) {
        const { data: contentItem, error: contentErr } = await supabaseAdmin
          .from("content_items")
          .insert({
            author_id: source.created_by,
            body: `[Ingested from ${source.platform} - Author: @${authorHandle}] ${sanitizeText(body)}`,
            language: analysis.language,
            visibility_status: "hidden",
            severity: analysis.severity as any,
            requires_review: true,
          })
          .select("id")
          .single();
        
        if (!contentErr && contentItem) {
          await Promise.resolve(supabaseAdmin.from("model_predictions").insert({
            content_id: contentItem.id,
            model_version: analysis.model_version,
            labels: analysis.labels,
            severity: analysis.severity as any,
            confidence: analysis.confidence,
            target_detected: analysis.target_detected,
            repetition_score: analysis.repetition_score,
            final_risk: analysis.final_risk,
            explanation: analysis.explanation,
            recommended_action: analysis.recommended_action,
            requires_review: true,
          })).catch(() => {});

          await Promise.resolve(supabaseAdmin.from("notifications").insert({
            audience: "staff",
            kind: "new_flag",
            severity: analysis.severity as any,
            title: `New flagged ingestion from ${source.name}`,
            object_type: "content",
            object_id: contentItem.id,
          })).catch(() => {});
        }
      }

      await Promise.resolve(supabaseAdmin.from("webhook_events")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("source_id", sourceId)
        .eq("status", "processing")
      ).catch(() => {});

      return new Response(JSON.stringify({
        ok: true,
        post,
        realtime: {
          alert_generated: analysis.requires_review && ["medium", "high", "critical"].includes(analysis.severity),
          severity: analysis.severity,
          confidence: analysis.confidence,
        }
      }), {
        status: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }
  }

  // ─── Supabase Database Webhook (for Supabase triggers) ──────
  if (url.pathname === "/api/webhook/supabase") {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" }
      });
    }
    try {
      const payload = await request.json() as any;
      const { type, table, record } = payload;

      if (table === "ingested_posts" && type === "INSERT" && record) {
        console.log(`[Supabase Webhook] New ingested post: ${record.id}, severity: ${record.severity}`);
      }
      if (table === "content_items" && type === "INSERT" && record) {
        console.log(`[Supabase Webhook] New content item: ${record.id}, severity: ${record.severity}`);
      }
      if (table === "realtime_alerts" && type === "INSERT" && record) {
        console.log(`[Supabase Webhook] 🚨 New realtime alert: ${record.alert_type}, severity: ${record.severity}`);
      }

      return new Response(JSON.stringify({ ok: true, processed: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
  }

  try {
    const response = await startHandler(request);
    return await normalizeCatastrophicSsrResponse(response);
  } catch (error) {
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
}

const defaultExport = {
  fetch: handleFetch,
};

export const fetch = handleFetch;
export default defaultExport;
