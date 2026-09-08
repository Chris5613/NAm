import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/AuthContext";
import { Loader2, Lock, ServerCrash } from "lucide-react";

export default function LoginScreen() {
  const { needsSetup, login, setup, unreachable, refresh } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setError("");

    if (needsSetup && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    if (needsSetup && password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }

    setBusy(true);
    try {
      if (needsSetup) await setup(username, password);
      else await login(username, password);
    } catch (submitError) {
      setError(submitError.message || "Could not sign in. Check that the backend is running.");
    } finally {
      setBusy(false);
    }
  };

  if (unreachable) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-md border-border/70">
          <CardContent className="p-6 text-center">
            <ServerCrash className="mx-auto h-8 w-8 text-rose-400" />
            <h1 className="mt-4 text-lg font-semibold">Cannot reach the server</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              The backend is not responding. Start it, then try again.
            </p>
            <Button className="mt-5 w-full" onClick={refresh}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md border-border/70">
        <CardContent className="p-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
            <Lock className="h-5 w-5" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold">{needsSetup ? "Create your account" : "Sign in"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {needsSetup
              ? "This is a single-user app. Choose the credentials you will use on every device."
              : "Your data is stored on the server and synced across devices."}
          </p>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <label className="text-sm font-medium" htmlFor="username">
                Username
              </label>
              <Input
                autoFocus
                id="username"
                className="mt-2"
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="password">
                Password
              </label>
              <Input
                id="password"
                type="password"
                className="mt-2"
                autoComplete={needsSetup ? "new-password" : "current-password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {needsSetup && (
              <div>
                <label className="text-sm font-medium" htmlFor="confirm">
                  Confirm password
                </label>
                <Input
                  id="confirm"
                  type="password"
                  className="mt-2"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(event) => setConfirm(event.target.value)}
                />
              </div>
            )}

            {error && <p className="text-sm text-rose-400">{error}</p>}

            <Button className="w-full" disabled={busy || !username || !password} type="submit">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {needsSetup ? "Create account" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
