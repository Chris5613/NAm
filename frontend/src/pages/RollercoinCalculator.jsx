import React, { useEffect, useMemo, useState } from "react";
import b1 from "./ranks/b1.png";
import b2 from "./ranks/b2.png";
import b3 from "./ranks/b3.png";
import s1 from "./ranks/s1.png";
import s2 from "./ranks/s2.png";
import s3 from "./ranks/s3.png";
import g1 from "./ranks/g1.png";
import g2 from "./ranks/g2.png";
import g3 from "./ranks/g3.png";
import p1 from "./ranks/p1.png";
import p2 from "./ranks/p2.png";
import p3 from "./ranks/p3.png";
import d1 from "./ranks/d1.png";
import d2 from "./ranks/d2.png";
import d3 from "./ranks/d3.png";



const leagueThresholds = [
  { icon: b1, name: "Bronze I", min: 0, max: 0.004999, unit: "Ph/s" },
  { icon: b2, name: "Bronze II", min: 0.005, max: 0.029999, unit: "Ph/s" },
  { icon: b3, name: "Bronze III", min: 0.03, max: 0.099999, unit: "Ph/s" },
  { icon: s1, name: "Silver I", min: 0.1, max: 0.199999, unit: "Ph/s" },
  { icon: s2, name: "Silver II", min: 0.2, max: 0.499999, unit: "Ph/s" },
  { icon: s3, name: "Silver III", min: 0.5, max: 0.999999, unit: "Ph/s" },
  { icon: g1, name: "Gold I", min: 1, max: 1.999, unit: "Eh/s" },
  { icon: g2, name: "Gold II", min: 2, max: 4.999, unit: "Eh/s" },
  { icon: g3, name: "Gold III", min: 5, max: 14.999, unit: "Eh/s" },
  { icon: p1, name: "Platinum I", min: 15, max: 49.999, unit: "Eh/s" },
  { icon: p2, name: "Platinum II", min: 50, max: 99.999, unit: "Eh/s" },
  { icon: p3, name: "Platinum III", min: 100, max: 199.999, unit: "Eh/s" },
{ icon: d1, name: "Diamond I", min: 200, max: 399.999, unit: "Eh/s" },
{ icon: d2, name: "Diamond II", min: 400, max: 9999.999, unit: "Eh/s" },
{ icon: d3, name: "Diamond III", min: 10, max: Infinity, unit: "Zh/s" },
];

const units = ["Gh/s", "Th/s", "Ph/s", "Eh/s", "Zh/s"];

function toEh(value, unit) {
  const num = Number(value) || 0;
  if (unit === "Gh/s") return num / 1_000_000_000;
  if (unit === "Th/s") return num / 1_000_000;
  if (unit === "Ph/s") return num / 1_000;
  if (unit === "Eh/s") return num;
  if (unit === "Zh/s") return num * 1_000;
  return num;
}

function cleanNumberInput(value) {
  return String(value).replace(/,/g, "").replace(/[^\d.]/g, "");
}

function formatFieldNumber(value) {
  const n = Number(value) || 0;
  return Number(n.toFixed(3)).toString();
}

function rawGhTo(value, unit) {
  const n = Number(value) || 0;
  if (unit === "Gh/s") return n;
  if (unit === "Th/s") return n / 1_000;
  if (unit === "Ph/s") return n / 1_000_000;
  if (unit === "Eh/s") return n / 1_000_000_000;
  if (unit === "Zh/s") return n / 1_000_000_000_000;
  return n;
}

function applyPowerToFields(power, setters) {
  if (!power) return;

  setters.setMinersPower(formatFieldNumber(rawGhTo(power.miners, "Eh/s")));
  setters.setMinersUnit("Eh/s");

  setters.setGamesPower(formatFieldNumber(rawGhTo(power.games, "Th/s")));
  setters.setGamesUnit("Th/s");

  setters.setRackPower(formatFieldNumber(rawGhTo(power.racks, "Eh/s")));
  setters.setRackUnit("Eh/s");

  setters.setNormalBonus(
    power.bonus_percent != null ? String(Number(power.bonus_percent) / 100) : ""
  );

  setters.setHamsterBonus(
    power.hamster_bonus_percent != null
      ? String(Number(power.hamster_bonus_percent) / 100)
      : "0"
  );
}

function formatEh(value) {
  if (!Number.isFinite(value)) return "0 EH/s";
  if (value >= 1000) return `${(value / 1000).toFixed(3)} Zh/s`;
  if (value >= 1) return `${value.toFixed(3)} Eh/s`;
  if (value >= 0.001) return `${(value * 1000).toFixed(3)} Ph/s`;
  if (value >= 0.000001) return `${(value * 1_000_000).toFixed(3)} Th/s`;
  return `${(value * 1_000_000_000).toFixed(3)} Gh/s`;
}

function getLeague(totalEh) {
  const match = leagueThresholds.find((league) => {
    const minEh =
      league.unit === "Zh/s"
        ? league.min * 1000
        : league.unit === "Eh/s"
        ? league.min
        : league.min / 1000;

    const maxEh =
      league.max === Infinity
        ? Infinity
        : league.unit === "Zh/s"
        ? league.max * 1000
        : league.unit === "Eh/s"
        ? league.max
        : league.max / 1000;

    return totalEh >= minEh && totalEh <= maxEh;
  });

  return match?.name || "Diamond III";
}

const inputRow = (label, value, onChange, unit, setUnit) => (
  <div className="grid grid-cols-[1fr_110px_90px] items-center border-b border-white/10 last:border-b-0">
    <label className="px-4 py-3 text-sm font-semibold text-slate-200">
      {label}
    </label>

    <input
      type="text"
      inputMode="decimal"
      value={value}
      onChange={(e) => onChange(cleanNumberInput(e.target.value))}
      className="m-2 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-2 text-right text-sm font-bold text-white outline-none focus:border-cyan-300"
    />

    {unit ? (
      <select
        value={unit}
        onChange={(e) => setUnit(e.target.value)}
        className="m-2 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-2 text-sm font-bold text-white outline-none focus:border-cyan-300"
      >
        {units.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </select>
    ) : (
      <div className="m-2 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-2 text-center text-sm font-bold text-white">
        %
      </div>
    )}
  </div>
);

const StatBox = ({ title, value, subtitle }) => (
  <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 shadow-xl">
    <p className="text-xs font-bold uppercase tracking-[0.25em] text-cyan-200/80">
      {title}
    </p>
    <p className="mt-3 text-3xl font-black text-white">{value}</p>
    {subtitle && <p className="mt-2 text-sm text-slate-300">{subtitle}</p>}
  </div>
);

export default function RollercoinCalculator() {
  const [loadedUser, setLoadedUser] = useState(null);

  const [minersPower, setMinersPower] = useState("");
  const [minersUnit, setMinersUnit] = useState("Eh/s");
  const [gamesPower, setGamesPower] = useState("");
  const [gamesUnit, setGamesUnit] = useState("Th/s");
  const [rackPower, setRackPower] = useState("");
  const [rackUnit, setRackUnit] = useState("Eh/s");
  const [normalBonus, setNormalBonus] = useState("");
  const [hamsterBonus, setHamsterBonus] = useState("");
  const [minerToAddPower, setMinerToAddPower] = useState("");
  const [minerToAddUnit, setMinerToAddUnit] = useState("Eh/s");
  const [minerToAddBonus, setMinerToAddBonus] = useState("");

  useEffect(() => {
    const handlePowerUpdate = (event) => {
      const power = event.detail;
      if (!power) return;

      setLoadedUser({ profile: { name: "RollerCoin User" }, power });

      applyPowerToFields(power, {
        setMinersPower,
        setMinersUnit,
        setGamesPower,
        setGamesUnit,
        setRackPower,
        setRackUnit,
        setNormalBonus,
        setHamsterBonus,
      });
    };

    window.addEventListener("rollercoin-power-update", handlePowerUpdate);

    window.postMessage(
      {
        source: "rollercoin-app",
        type: "REQUEST_POWER_BY_USERNAME",
      },
      window.location.origin
    );

    try {
      const raw = window.localStorage.getItem("rollercoin:extension-state");
      const state = raw ? JSON.parse(raw) : null;
      const power = state?.power_payload;

      if (power) handlePowerUpdate({ detail: power });
    } catch {}

    return () => {
      window.removeEventListener("rollercoin-power-update", handlePowerUpdate);
    };
  }, []);

  const result = useMemo(() => {
    const currentMinersEh = toEh(minersPower, minersUnit);
    const gamesEh = toEh(gamesPower, gamesUnit);
    const rackEh = toEh(rackPower, rackUnit);
    const bonusPercent = (Number(normalBonus) || 0) + (Number(hamsterBonus) || 0);
    const multiplier = 1 + bonusPercent / 100;

    const currentMinerPowerWithBonus = currentMinersEh * multiplier;
    const currentPower = currentMinerPowerWithBonus + gamesEh + rackEh;

const addedMinerBaseEh = toEh(minerToAddPower, minerToAddUnit);

const addedMinerBonusPercent =
  bonusPercent + (Number(minerToAddBonus) || 0);

const addedMinerMultiplier = 1 + addedMinerBonusPercent / 100;

const addedBasePower = addedMinerBaseEh;
const addedPowerWithBonus = addedMinerBaseEh * addedMinerMultiplier;

const afterPower = currentPower + addedPowerWithBonus;

    return {
      multiplier,
      currentPower,
      addedPower,
      afterPower,
      currentLeague: getLeague(currentPower),
      afterLeague: getLeague(afterPower),
      addedPower,
      addedBasePower,
      addedPowerWithBonus,
    };
  }, [
    minersPower,
    minersUnit,
    gamesPower,
    gamesUnit,
    rackPower,
    rackUnit,
    normalBonus,
    hamsterBonus,
    minerToAddPower,
    minerToAddUnit,
    minerToAddBonus,
    
  ]);

  return (
    <main className="min-h-screen bg-[#05070D] px-4 py-8 text-white sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 text-center">
          <h1 className="mt-3 text-4xl font-black uppercase tracking-wide text-slate-100 sm:text-6xl">
            Rollercoin Calculator
          </h1>

          {loadedUser?.profile?.name && (
            <p className="mt-3 text-sm font-semibold text-cyan-100">
              Loaded stats for {loadedUser.profile.name}
            </p>
          )}
        </div>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          <StatBox title="Current Power" value={formatEh(result.currentPower)} subtitle={result.currentLeague} />
          <StatBox
            title="Miner Adds"
            value={formatEh(result.addedPowerWithBonus)}
            subtitle={`Bonus multiplier: ${result.multiplier.toFixed(4)}x`}
          />
          <StatBox title="After Acquisition" value={formatEh(result.afterPower)} subtitle={result.afterLeague} />
        </section>

        <section className="grid gap-6 lg:grid-cols-[1fr_1fr_0.8fr]">
          <div className="overflow-hidden rounded-2xl border border-red-300/20 bg-red-950/40 shadow-xl">
            <div className="bg-red-900/70 px-4 py-3 text-center text-lg font-black uppercase tracking-widest text-red-50">
              Your Information
            </div>
            {inputRow("Miners power", minersPower, setMinersPower, minersUnit, setMinersUnit)}
            {inputRow("Games", gamesPower, setGamesPower, gamesUnit, setGamesUnit)}
            {inputRow("Rack power", rackPower, setRackPower, rackUnit, setRackUnit)}
            {inputRow("Normal Bonus", normalBonus, setNormalBonus)}
            {inputRow("Hamster Bonus", hamsterBonus, setHamsterBonus)}
          </div>

          <div className="space-y-6">
            <div className="overflow-hidden rounded-2xl border border-violet-300/20 bg-violet-950/40 shadow-xl">
              <div className="bg-violet-900/70 px-4 py-3 text-center text-lg font-black uppercase tracking-widest text-violet-50">
                Miner To Add
              </div>
              {inputRow("Power", minerToAddPower, setMinerToAddPower, minerToAddUnit, setMinerToAddUnit)}
              {inputRow("Miner Bonus", minerToAddBonus, setMinerToAddBonus)}
            </div>

            <div className="overflow-hidden rounded-2xl border border-cyan-300/20 bg-cyan-950/40 shadow-xl">
              <div className="bg-cyan-900/70 px-4 py-3 text-center text-lg font-black uppercase tracking-widest text-cyan-50">
                Power Difference
              </div>
<div className="grid grid-cols-2 border-b border-white/10 px-4 py-3 text-sm">
  <span className="font-semibold text-slate-200">Base miner power</span>
  <span className="text-right font-black text-white">
    {formatEh(result.addedBasePower)}
  </span>
</div>

<div className="grid grid-cols-2 px-4 py-3 text-sm">
  <span className="font-semibold text-slate-200">With account + miner bonus</span>
  <span className="text-right font-black text-white">
    {formatEh(result.addedPowerWithBonus)}
  </span>
</div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-green-300/20 bg-green-950/40 shadow-xl">
            <div className="bg-green-900/70 px-4 py-3 text-center text-lg font-black uppercase tracking-widest text-green-50">
              League Thresholds
            </div>

<div className="divide-y divide-white/10">
  {leagueThresholds.map((league) => {
    const active = result.afterLeague === league.name;

    return (
      <div
        key={league.name}
        className={`grid grid-cols-[1fr_1.2fr] items-center px-4 py-3 text-sm ${
          active ? "bg-cyan-300/20" : ""
        }`}
      >
        <div className="flex items-center gap-3">
          <img
            src={league.icon}
            alt={league.name}
            className="h-8 w-8 object-contain"
          />

          <span className="font-black text-white">
            {league.name}
          </span>
        </div>

        <span className="text-right font-bold text-green-100">
          {league.max === Infinity
            ? `${league.min.toFixed(3)}+ ${league.unit}`
            : `${league.min.toFixed(3)} - ${league.max.toFixed(3)} ${league.unit}`}
        </span>
      </div>
    );
  })}
</div>
          </div>
        </section>
      </div>
    </main>
  );
}