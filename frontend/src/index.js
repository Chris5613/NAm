import React, { useState } from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const APP_PASSWORD = "2428";

function PasswordGate() {
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(
    sessionStorage.getItem("app_unlocked") === "true"
  );
  const [error, setError] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();

    if (password === APP_PASSWORD) {
      sessionStorage.setItem("app_unlocked", "true");
      setUnlocked(true);
      setError("");
    } else {
      setError("Wrong password");
    }
  };

  if (unlocked) return <App />;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm bg-card border border-border rounded-xl p-6 space-y-4"
      >
        <div>
          <h1 className="text-lg font-semibold text-foreground">
            Enter Password
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Password required to access dashboard.
          </p>
        </div>

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm outline-none"
          autoFocus
        />

        {error && (
          <p className="text-sm text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="w-full bg-cyan-500 hover:bg-cyan-400 text-black rounded-md py-2 text-sm font-medium"
        >
          Unlock
        </button>
      </form>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <PasswordGate />
  </React.StrictMode>
);