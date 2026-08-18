import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type TableName =
  | "content_items"
  | "reports"
  | "model_predictions"
  | "media_evidence"
  | "privacy_requests"
  | "appeals"
  | "moderation_decisions"
  | "audit_logs"
  | "notifications"
  | "notification_reads"
  | "datasets"
  | "benchmark_runs"
  | "benchmark_results"
  | "fewshot_examples"
  | "ingest_sources"
  | "ingested_posts";

/**
 * Live updates over the Supabase realtime WebSocket: any change to the given
 * tables invalidates the listed query keys, so open consoles refresh instantly.
 */
export function useRealtime(
  channelName: string,
  tables: TableName[],
  queryKeys: string[],
  onEvent?: (table: TableName) => void,
) {
  const qc = useQueryClient();
  const tableKey = tables.join(",");
  const keyList = queryKeys.join(",");

  useEffect(() => {
    const channel = supabase.channel(`rt-${channelName}-${Math.random().toString(36).substring(2, 9)}`);
    for (const table of tableKey.split(",") as TableName[]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => {
        for (const key of keyList.split(",")) {
          void qc.invalidateQueries({ queryKey: [key] });
        }
        onEvent?.(table);
      });
    }
    channel.subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelName, tableKey, keyList, qc]);
}
