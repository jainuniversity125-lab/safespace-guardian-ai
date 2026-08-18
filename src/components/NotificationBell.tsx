import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/useNotifications";

export function NotificationBell() {
  const { items, unreadCount, markRead, markAllRead } = useNotifications();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="relative" aria-label="Notifications">
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-semibold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Priority alerts</span>
          <Button size="sm" variant="ghost" onClick={() => void markAllRead()}>
            Mark all read
          </Button>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted-foreground">Nothing needs attention.</p>
          )}
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => void markRead([n.id])}
              className="block w-full border-b border-border px-3 py-2 text-left last:border-0 hover:bg-accent"
            >
              <div className="flex items-center gap-2">
                {!n.read && <span className="size-2 shrink-0 rounded-full bg-primary" />}
                <span className="text-sm font-medium">{n.title}</span>
              </div>
              {n.body && (
                <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.body}</p>
              )}
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {n.severity} · {new Date(n.created_at).toLocaleString()}
              </p>
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
