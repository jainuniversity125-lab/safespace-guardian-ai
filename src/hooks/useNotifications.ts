import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRealtime } from "@/hooks/useRealtime";

export type AppNotification = {
  id: string;
  kind: string;
  severity: string;
  title: string;
  body: string | null;
  object_type: string;
  object_id: string | null;
  created_at: string;
  read: boolean;
};

/**
 * Live notification feed over the realtime WebSocket: priority items land in the
 * moderator queue immediately, with per-case activity and an unread count.
 */
export function useNotifications() {
  const { user } = useAuth();
  const qc = useQueryClient();

  useRealtime("notifications", ["notifications", "notification_reads"], ["notifications"]);

  const query = useQuery({
    queryKey: ["notifications", user?.id ?? null],
    enabled: Boolean(user),
    queryFn: async (): Promise<AppNotification[]> => {
      const [{ data: rows, error }, { data: reads }] = await Promise.all([
        supabase
          .from("notifications")
          .select("id, kind, severity, title, body, object_type, object_id, created_at")
          .order("created_at", { ascending: false })
          .limit(60),
        supabase.from("notification_reads").select("notification_id").eq("user_id", user!.id),
      ]);
      if (error) throw new Error(error.message);
      const readSet = new Set((reads ?? []).map((r) => r.notification_id));
      return (rows ?? []).map((r) => ({ ...r, read: readSet.has(r.id) }));
    },
  });

  const items = query.data ?? [];
  const unread = items.filter((n) => !n.read);

  /** Unread activity per case object, for the per-case indicators in the queue. */
  const unreadByObject: Record<string, number> = {};
  for (const n of unread) {
    if (n.object_id) unreadByObject[n.object_id] = (unreadByObject[n.object_id] ?? 0) + 1;
  }

  const markRead = useCallback(
    async (ids: string[]) => {
      if (!user || ids.length === 0) return;
      await supabase
        .from("notification_reads")
        .upsert(
          ids.map((id) => ({ notification_id: id, user_id: user.id })),
          { onConflict: "notification_id,user_id" },
        );
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    [user, qc],
  );

  const markAllRead = useCallback(() => markRead(unread.map((n) => n.id)), [markRead, unread]);

  return { items, unread, unreadCount: unread.length, unreadByObject, markRead, markAllRead };
}
