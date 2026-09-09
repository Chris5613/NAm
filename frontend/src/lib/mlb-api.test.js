import {
  fetchTodaySlate,
  gradeFirstInningBet,
  getPacificDateKey,
  getFirstInningRuns,
} from "./mlb-api";

describe("MLB date keys", () => {
  it("keeps late Pacific games on the Pacific calendar day", () => {
    expect(getPacificDateKey("2026-08-28T01:40:00Z")).toBe("2026-08-27");
  });
});

describe("schedule fallback", () => {
  it("falls back to the public MLB API when the backend proxy is unavailable", async () => {
    const originalFetch = global.fetch;
    const calls = [];

    global.fetch = jest.fn((url) => {
      calls.push(String(url));
      if (String(url).includes("/api/market/mlb/")) {
        return Promise.resolve({ ok: false, status: 500 });
      }

      if (String(url).includes("/api/v1/people")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            people: [
              {
                id: 10,
                pitchHand: { code: "R" },
                stats: [
                  {
                    group: { displayName: "pitching" },
                    splits: [{ stat: { wins: 12, losses: 7, era: 3.42, whip: 1.12, inningsPitched: "132.1", strikeOuts: 139, gamesStarted: 21 } }],
                  },
                ],
              },
              {
                id: 11,
                pitchHand: { code: "L" },
                stats: [
                  {
                    group: { displayName: "pitching" },
                    splits: [{ stat: { wins: 10, losses: 9, era: 4.11, whip: 1.18, inningsPitched: "129.0", strikeOuts: 122, gamesStarted: 20 } }],
                  },
                ],
              },
            ],
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: async () => ({
          dates: [
            {
              games: [
                {
                  gamePk: 123,
                  gameDate: "2026-09-09T20:00:00Z",
                  status: { detailedState: "Preview", abstractGameState: "Preview" },
                  teams: {
                    away: {
                      team: { id: 1, name: "A" },
                      leagueRecord: { wins: 70, losses: 60 },
                      probablePitcher: { id: 10, fullName: "Pitcher A" },
                    },
                    home: {
                      team: { id: 2, name: "B" },
                      leagueRecord: { wins: 72, losses: 58 },
                      probablePitcher: { id: 11, fullName: "Pitcher B" },
                    },
                  },
                  venue: { name: "Fenway Park" },
                },
              ],
            },
          ],
        }),
      });
    });

    try {
      const games = await fetchTodaySlate("2026-09-09");
      expect(games).toHaveLength(1);
      expect(games[0].away.pitcher.name).toBe("Pitcher A");
      expect(calls.some((url) => url.includes("/api/market/mlb/schedule"))).toBe(true);
      expect(calls.some((url) => url.includes("https://statsapi.mlb.com/api/v1/schedule"))).toBe(true);
      expect(calls.some((url) => url.includes("https://statsapi.mlb.com/api/v1/people"))).toBe(true);
    } finally {
      global.fetch = originalFetch;
    }
  });
});

describe("first inning grading", () => {
  it("returns zero runs for a scoreless first inning", () => {
    const game = {
      linescore: {
        innings: [{ away: { runs: 0 }, home: { runs: 0 } }],
      },
    };

    expect(getFirstInningRuns(game)).toBe(0);
    expect(gradeFirstInningBet(game, "NRFI")).toBe("win");
    expect(gradeFirstInningBet(game, "YRFI")).toBe("loss");
  });

  it("returns a run for a first inning that scored", () => {
    const game = {
      linescore: {
        innings: [{ away: { runs: 1 }, home: { runs: 0 } }],
      },
    };

    expect(getFirstInningRuns(game)).toBe(1);
    expect(gradeFirstInningBet(game, "NRFI")).toBe("loss");
    expect(gradeFirstInningBet(game, "YRFI")).toBe("win");
  });

  it("stays pending before the first inning is complete", () => {
    const game = {
      linescore: {
        currentInning: 1,
        isTopInning: true,
        innings: [{ away: { runs: 0 } }],
      },
    };

    expect(getFirstInningRuns(game)).toBe(null);
    expect(gradeFirstInningBet(game, "NRFI")).toBe(null);
  });
});
