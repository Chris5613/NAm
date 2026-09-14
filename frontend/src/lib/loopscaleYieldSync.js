import {
  proxyFetch,
} from "./cors-proxy";

export const LOOPSCALE_WALLET =
  "GCPg6e28DTuP3v9KYGR5n7adUr2bxiS8d7deHHgc2UNM";

export const LOOPSCALE_ONYC_STARTED_AT =
  "2026-09-13T00:00:00-07:00";

/*
 * First position screenshot:
 *
 * position value: $1,001.83
 * P&L:            +$1.96
 *
 * Starting equity:
 * $999.87
 *
 * Only used if Loopscale does not return P&L directly.
 */
const LOOPSCALE_INITIAL_EQUITY_USD =
  999.87;

/*
 * Last known net APY from Loopscale itself.
 *
 * Only a fallback. Live API values take priority.
 */
const FALLBACK_NET_APY =
  17.47;

const PORTFOLIO_ENDPOINT =
  "/loopscale/v1/markets/earn/portfolio/positions";

function toNumber(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (
    typeof value ===
    "string"
  ) {
    const cleaned =
      value.replace(
        /[^0-9.-]/g,
        ""
      );

    const number =
      Number(cleaned);

    return Number.isFinite(
      number
    )
      ? number
      : 0;
  }

  const number =
    Number(value);

  return Number.isFinite(
    number
  )
    ? number
    : 0;
}

function toPercent(
  value
) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return 0;
  }

  if (
    typeof value ===
      "string" &&
    value.includes("%")
  ) {
    return toNumber(
      value
    );
  }

  const number =
    Number(value);

  if (
    !Number.isFinite(
      number
    )
  ) {
    return 0;
  }

  /*
   * Support both:
   *
   * 0.1747 -> 17.47%
   * 17.47  -> 17.47%
   */
  return Math.abs(
    number
  ) <= 1
    ? number * 100
    : number;
}

function normalizeText(
  value
) {
  return String(
    value ?? ""
  )
    .trim()
    .toLowerCase();
}

function safeStringify(
  value
) {
  try {
    return JSON.stringify(
      value
    );
  } catch {
    return "";
  }
}

function collectObjects(
  value,
  path = [],
  output = []
) {
  if (
    !value ||
    typeof value !==
      "object"
  ) {
    return output;
  }

  output.push({
    value,
    path,
  });

  if (
    Array.isArray(
      value
    )
  ) {
    value.forEach(
      (
        child,
        index
      ) => {
        collectObjects(
          child,
          [
            ...path,
            String(index),
          ],
          output
        );
      }
    );

    return output;
  }

  Object.entries(
    value
  ).forEach(
    ([
      key,
      child,
    ]) => {
      if (
        child &&
        typeof child ===
          "object"
      ) {
        collectObjects(
          child,
          [
            ...path,
            key,
          ],
          output
        );
      }
    }
  );

  return output;
}

function hasMeaningfulPayload(
  payload
) {
  if (
    payload === null ||
    payload === undefined
  ) {
    return false;
  }

  if (
    Array.isArray(
      payload
    )
  ) {
    return (
      payload.length >
      0
    );
  }

  if (
    typeof payload !==
    "object"
  ) {
    return true;
  }

  const keys =
    Object.keys(
      payload
    );

  if (
    !keys.length
  ) {
    return false;
  }

  const obviousArrays = [
    payload?.positions,
    payload?.items,
    payload?.data,
    payload?.portfolioPositions,
  ];

  const presentArrays =
    obviousArrays.filter(
      Array.isArray
    );

  if (
    presentArrays.length
  ) {
    return presentArrays.some(
      (
        array
      ) =>
        array.length >
       