import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Plus, RefreshCw, CalendarDays } from "lucide-react";
import {
  fetchTodaySlate,
  formatFirstPitch,
  getTodayDateKey,
} from "@/lib/mlb-api";

function TeamLogo({ teamId, name }) {
  if (!teamId) {
    return <div className="w-10 h-10 rounded-full bg-secondary shrink-0" />;
  }

  return (
    <img
      src={`https://www.mlbstatic.com/team-logos/${teamId}.svg`}
      alt={name}
      className="w-10 h-10 shrink-0"
      loading="lazy"
    />
  );
}

function dateKeyToDate(dateKey) {
  return new Date(`${dateKey}T12:00:00`);
}

function dateToDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function PitcherLine({ side, team }) {
  const { pitcher } = team;
  const stats = pitcher.stats;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {side}
      </p>

      <p className="text-base font-medium text-foreground truncate">
        {pitcher.name}
        {pitcher.hand ? (
          <span className="text-muted-foreground"> ({pitcher.hand})</span>
        ) : null}
      </p>

      {stats ? (
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs font-mono text-muted-foreground">
          <span>{stats.record}</span>
          <span>{stats.era} ERA</span>
          <span>{stats.whip} WHIP</span>
          <span>{stats.inningsPitched} IP</span>
          <span>{stats.strikeOuts} K</span>
        </div>
      ) : (
        <p className="text-xs font-mono text-muted-foreground">
          No season stats
        </p>
      )}
    </div>
  );
}

function GameCard({ game, onAddBet }) {
  return (
    <Card className="border-border/40 bg-secondary/20">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-3 min-w-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <TeamLogo teamId={game.away.id} name={game.away.name} />
              <span className="text-base font-semibold text-foreground truncate">
                {game.away.name}
              </span>
              {game.away.record ? (
                <span className="text-xs font-mono text-muted-foreground">
                  {game.away.record}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2.5 min-w-0">
              <TeamLogo teamId={game.home.id} name={game.home.name} />
              <span className="text-base font-semibold text-foreground truncate">
                {game.home.name}
              </span>
              {game.home.record ? (
                <span className="text-xs font-mono text-muted-foreground">
                  {game.home.record}
                </span>
              ) : null}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
              game.abstractStatus === "Final"
                ? "bg-slate-700 text-slate-200"
                : game.abstractStatus === "Live"
                  ? "bg-rose-500/20 text-rose-300"
                  : "bg-emerald-500/15 text-emerald-300"
            }`}>
              {game.abstractStatus === "Final" ? "Final" : game.abstractStatus === "Live" ? "Live" : "Scheduled"}
            </span>
            {game.doubleHeader ? (
              <span className="text-[10px] font-mono text-muted-foreground">Game {game.gameNumber}</span>
            ) : null}
            <span className="text-sm font-mono text-muted-foreground whitespace-nowrap">
              {formatFirstPitch(game.gameDate)}
            </span>

            <Button
              size="icon"
              variant="outline"
              title="Add as bet"
              aria-label={`Add ${game.away.name} at ${game.home.name} as a bet`}
              onClick={() => onAddBet(game)}
              className="h-9 w-9 border-border/40"
            >
              <Plus className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 border-t border-border/40 pt-4">
          <PitcherLine side="Away starter" team={game.away} />
          <PitcherLine side="Home starter" team={game.home} />
        </div>
      </CardContent>
    </Card>
  );
}

export default function MlbSlate({ onAddBet }) {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState(() => getTodayDateKey());
  const [calendarOpen, setCalendarOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setGames(await fetchTodaySlate(selectedDate));
    } catch {
      setError("Could not load the MLB slate for this date.");
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="w-4 h-4" />
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-8 border-border/40 bg-background px-2 font-mono text-xs text-foreground"
              >
                {selectedDate}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto border-border bg-card p-0" align="start">
              <Calendar
                mode="single"
                selected={dateKeyToDate(selectedDate)}
                onSelect={(date) => {
                  if (!date) return;
                  setSelectedDate(dateToDateKey(date));
                  setCalendarOpen(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          <span>·</span>
          <span>{games.length} games</span>
        </div>

        <Button
          size="sm"
          variant="outline"
          onClick={load}
          disabled={loading}
          className="border-border/40"
        >
          <RefreshCw
            className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading slate…</p>
      ) : error ? (
        <p className="text-sm text-rose-400">{error}</p>
      ) : games.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No MLB games scheduled today.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {games.map((game) => (
            <GameCard key={game.id} game={game} onAddBet={onAddBet} />
          ))}
        </div>
      )}
    </div>
  );
}
