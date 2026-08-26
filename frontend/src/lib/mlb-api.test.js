import {
  gradeFirstInningBet,
  getFirstInningRuns,
} from "./mlb-api";

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
