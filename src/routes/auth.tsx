import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — SafeSpace Content Safety" },
      {
        name: "description",
        content:
          "Sign in or create an account to post safely, report cyberbullying and track your cases on SafeSpace.",
      },
      { property: "og:title", content: "Sign in — SafeSpace Content Safety" },
      {
        property: "og:description",
        content: "Secure access to the SafeSpace cyberbullying detection and moderation platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [ageBand, setAgeBand] = useState("adult");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/feed" });
    });
  }, [navigate]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    void navigate({ to: "/feed" });
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) {
      toast.error("Please accept the data-processing notice to continue.");
      return;
    }
    const name = displayName.trim() || email.split("@")[0] || "Member";
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: { display_name: name },
      },
    });
    if (!error) {
      const { data } = await supabase.auth.getUser();
      if (data.user) {
        await supabase
          .from("profiles")
          .update({ display_name: name, age_band: ageBand, consent_status: true })
          .eq("id", data.user.id);
      }
    }
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Account created. Welcome to SafeSpace.");
    void navigate({ to: "/feed" });
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("Google sign-in failed. Please try again.");
      return;
    }
    if (result.redirected) return;
    void navigate({ to: "/feed" });
  }


  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <Link to="/" className="flex items-center justify-center gap-2 text-lg font-semibold">
          <ShieldCheck className="size-5 text-primary" /> SafeSpace
        </Link>
        <div className="panel p-6">
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={signIn} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  Sign in
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Display name</Label>
                  <Input id="name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email2">Email</Label>
                  <Input id="email2" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password2">Password</Label>
                  <Input id="password2" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="age">Age band</Label>
                  <select
                    id="age"
                    value={ageBand}
                    onChange={(e) => setAgeBand(e.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="under_13">Under 13 (guardian consent required)</option>
                    <option value="13_17">13–17 (guardian consent required)</option>
                    <option value="adult">18 or older</option>
                  </select>
                </div>
                <label className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Checkbox checked={consent} onCheckedChange={(v) => setConsent(Boolean(v))} />
                  <span>
                    I understand that content I submit is analysed for safety, stored for the stated
                    retention period, reviewable by trained moderators, and that I can withdraw
                    consent or request deletion at any time. Minors need verifiable guardian consent.
                  </span>
                </label>
                <Button type="submit" className="w-full" disabled={busy}>
                  Create account
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" className="w-full" onClick={() => void google()}>
            Continue with Google
          </Button>
        </div>
      </div>
    </div>
  );
}
