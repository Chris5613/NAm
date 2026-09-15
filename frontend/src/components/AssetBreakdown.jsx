import { useState } from "react";
import { assetsApi } from "@/lib/api";
import { toast } from "sonner";

import {
  Card,
  CardContent,
} from "@/components/ui/card";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  ChevronDown,
  ChevronRight,
  TrendingUp,
  Landmark,
  CreditCard,
  Boxes,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";

import EditAssetDialog from "@/components/EditAssetDialog";

/* =========================================================
   CATEGORY META
========================================================= */

const CATEGORY_META = {
  stocks: {
    label: "Stocks",
    Icon: TrendingUp,
    color: "text-emerald-400",
  },

  cash: {
    label: "Cash",
    Icon: Landmark,
    color: "text-blue-400",
  },

  debts: {
    label: "Debts",
    Icon: CreditCard,
    color: "text-rose-400",
  },

  other: {
    label: "Other Assets",
    Icon: Boxes,
    color: "text-amber-400",
  },
};

/* =========================================================
   HELPERS
========================================================= */

function formatCurrency(value) {
  if (
    !value &&
    value !== 0
  ) {
    return "$0.00";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }
  ).format(value);
}

function getAssetValue(asset) {
  if (
    asset.manual_value !==
      null &&
    asset.manual_value !==
      undefined
  ) {
    return Number(
      asset.manual_value
    ) || 0;
  }

  return (
    (Number(
      asset.quantity
    ) || 0) *
    (Number(
      asset.current_price
    ) || 0)
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export default function AssetBreakdown({
  category,
  assets,
  onUpdate,
  onDelete,
  defaultOpen = false,
  dailyChange = 0,
  emptyMessage,

  /* When true, skips the category summary card
     and shows the individual asset cards directly. */
  hideSummary = false,
}) {
  const meta =
    CATEGORY_META[
      category
    ] ||
    CATEGORY_META.cash;

  const Icon =
    meta.Icon;

  const [
    open,
    setOpen,
  ] = useState(
    hideSummary
      ? true
      : defaultOpen
  );

  const [
    expandedId,
    setExpandedId,
  ] = useState(null);

  const [
    editAsset,
    setEditAsset,
  ] = useState(null);

  /* =======================================================
     DATA
  ======================================================= */

  const items =
    (assets || [])
      .filter(
        (asset) =>
          asset.category ===
          category
      )
      .sort(
        (a, b) =>
          getAssetValue(b) -
          getAssetValue(a)
      );

  const total =
    items.reduce(
      (
        sum,
        asset
      ) =>
        sum +
        getAssetValue(
          asset
        ),
      0
    );

  /* =======================================================
     DELETE
  ======================================================= */

  const handleDelete =
    async (
      asset
    ) => {
      if (
        !window.confirm(
          `Delete ${asset.name}?`
        )
      ) {
        return;
      }

      try {
        await assetsApi.delete(
          asset.id
        );

        toast.success(
          `${asset.name} deleted`
        );

        onDelete?.();
      } catch {
        toast.error(
          "Failed to delete"
        );
      }
    };

  /* =======================================================
     EMPTY COLLAPSED CARD
  ======================================================= */

  if (
    items.length === 0 &&
    !defaultOpen &&
    !hideSummary
  ) {
    return (
      <Card
        className="
          cursor-pointer
          border-border/40
          bg-card
          transition-colors
          hover:border-white/10
        "
        data-testid={`${category}-top-card`}
        onClick={() =>
          setOpen(
            !open
          )
        }
      >
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ChevronRight
                className="h-4 w-4 text-muted-foreground"
                strokeWidth={
                  1.5
                }
              />

              <div
                className="
                  flex
                  h-8
                  w-8
                  items-center
                  justify-center
                  rounded-full
                  bg-secondary
                "
              >
                <Icon
                  className={`h-4 w-4 ${meta.color}`}
                  strokeWidth={
                    1.5
                  }
                />
              </div>

              <div>
                <span className="text-lg font-semibold text-foreground">
                  {
                    meta.label
                  }
                </span>

                <p className="mt-0.5 text-xs text-muted-foreground">
                  No entries yet
                </p>
              </div>
            </div>

            <div className="min-w-[120px] text-right">
              <p className="text-xs text-muted-foreground">
                Total
              </p>

              <p className="font-mono text-base font-bold text-foreground">
                {formatCurrency(
                  0
                )}
              </p>

              <p
                className={`mt-1 font-mono text-xs ${
                  dailyChange >=
                  0
                    ? "text-emerald-500"
                    : "text-rose-500"
                }`}
              >
                {dailyChange >=
                0
                  ? "+"
                  : "-"}

                {formatCurrency(
                  Math.abs(
                    dailyChange
                  )
                )}{" "}
                today
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* =======================================================
     MAIN
  ======================================================= */

  return (
    <div
      className="space-y-3"
      data-testid={`${category}-breakdown`}
    >
      {/* =================================================
          SUMMARY CARD

          Hidden inside your dashboard modal when
          hideSummary={true}
      ================================================= */}

      {!hideSummary && (
        <Card
          className="
            cursor-pointer
            border-border/40
            bg-card
            transition-colors
            hover:border-white/10
          "
          data-testid={`${category}-top-card`}
          onClick={() =>
            setOpen(
              !open
            )
          }
        >
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {open ? (
                  <ChevronDown
                    className="h-4 w-4 text-muted-foreground"
                    strokeWidth={
                      1.5
                    }
                  />
                ) : (
                  <ChevronRight
                    className="h-4 w-4 text-muted-foreground"
                    strokeWidth={
                      1.5
                    }
                  />
                )}

                <div
                  className="
                    flex
                    h-8
                    w-8
                    items-center
                    justify-center
                    rounded-full
                    bg-secondary
                  "
                >
                  <Icon
                    className={`h-4 w-4 ${meta.color}`}
                    strokeWidth={
                      1.5
                    }
                  />
                </div>

                <div>
                  <span className="text-lg font-semibold text-foreground">
                    {
                      meta.label
                    }
                  </span>

                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {
                      items.length
                    }{" "}
                    {items.length ===
                    1
                      ? "entry"
                      : "entries"}
                  </p>
                </div>
              </div>

              <div className="min-w-[120px] text-right">
                <p className="text-xs text-muted-foreground">
                  Total
                </p>

                <p
                  className={`font-mono text-base font-bold ${
                    category ===
                    "debts"
                      ? "text-rose-400"
                      : "text-foreground"
                  }`}
                >
                  {category ===
                    "debts" &&
                  total > 0
                    ? "-"
                    : ""}

                  {formatCurrency(
                    total
                  )}
                </p>

                <p
                  className={`mt-1 font-mono text-xs ${
                    category ===
                    "debts"
                      ? dailyChange <=
                        0
                        ? "text-emerald-500"
                        : "text-rose-500"
                      : dailyChange >=
                          0
                        ? "text-emerald-500"
                        : "text-rose-500"
                  }`}
                >
                  {dailyChange >=
                  0
                    ? "+"
                    : "-"}

                  {formatCurrency(
                    Math.abs(
                      dailyChange
                    )
                  )}{" "}
                  today
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* =================================================
          EMPTY STATE
      ================================================= */}

      {open &&
        items.length ===
          0 && (
          <div
            className={
              hideSummary
                ? ""
                : "ml-6"
            }
          >
            <Card className="border-border/30 bg-secondary/30">
              <CardContent className="p-5 text-center">
                <p className="text-sm text-muted-foreground">
                  {emptyMessage ||
                    `No ${meta.label.toLowerCase()} added yet.`}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

      {/* =================================================
          ASSET CARDS
      ================================================= */}

      {open &&
        items.length >
          0 && (
          <div
            className={`space-y-2 ${
              hideSummary
                ? ""
                : "ml-6"
            }`}
            data-testid={`${category}-items-list`}
          >
            {items.map(
              (
                asset
              ) => {
                const value =
                  getAssetValue(
                    asset
                  );

                const expanded =
                  expandedId ===
                  asset.id;

                const hasDetails =
                  category ===
                    "stocks" &&
                  Number(
                    asset.quantity
                  ) > 0;

                const pct =
                  total > 0
                    ? (
                        (value /
                          total) *
                        100
                      ).toFixed(
                        1
                      )
                    : "0.0";

                return (
                  <div
                    key={
                      asset.id
                    }
                  >
                    <Card
                      className="
                        cursor-pointer
                        border-border/30
                        bg-secondary/30
                        transition-colors
                        hover:border-white/10
                      "
                      data-testid={`item-box-${asset.id}`}
                      onClick={() =>
                        setExpandedId(
                          expanded
                            ? null
                            : asset.id
                        )
                      }
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            {hasDetails ? (
                              expanded ? (
                                <ChevronDown
                                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                  strokeWidth={
                                    1.5
                                  }
                                />
                              ) : (
                                <ChevronRight
                                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                                  strokeWidth={
                                    1.5
                                  }
                                />
                              )
                            ) : (
                              <span className="w-3.5 shrink-0" />
                            )}

                            <div
                              className="
                                flex
                                h-6
                                w-6
                                shrink-0
                                items-center
                                justify-center
                                rounded-full
                                bg-secondary
                              "
                            >
                              <Icon
                                className={`h-3 w-3 ${meta.color}`}
                                strokeWidth={
                                  1.5
                                }
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="truncate font-medium text-foreground">
                                  {
                                    asset.name
                                  }
                                </span>

                                {asset.symbol && (
                                  <span
                                    className="
                                      rounded
                                      bg-secondary/60
                                      px-1.5
                                      py-0.5
                                      font-mono
                                      text-[10px]
                                      uppercase
                                      text-muted-foreground
                                    "
                                  >
                                    {
                                      asset.symbol
                                    }
                                  </span>
                                )}

                                <span
                                  className="
                                    rounded
                                    bg-secondary/60
                                    px-2
                                    py-0.5
                                    font-mono
                                    text-xs
                                    text-muted-foreground
                                  "
                                >
                                  {
                                    pct
                                  }
                                  %
                                </span>
                              </div>

                              {asset.notes && (
                                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                                  {
                                    asset.notes
                                  }
                                </p>
                              )}
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-4">
                            <div className="min-w-[100px] text-right">
                              <p className="text-[10px] text-muted-foreground">
                                Value
                              </p>

                              <p
                                className={`font-mono text-sm font-medium ${
                                  category ===
                                  "debts"
                                    ? "text-rose-400"
                                    : "text-foreground"
                                }`}
                              >
                                {category ===
                                "debts"
                                  ? "-"
                                  : ""}

                                {formatCurrency(
                                  value
                                )}
                              </p>
                            </div>

                            <DropdownMenu>
                              <DropdownMenuTrigger
                                asChild
                                onClick={(
                                  event
                                ) =>
                                  event.stopPropagation()
                                }
                              >
                                <button
                                  type="button"
                                  className="
                                    rounded
                                    p-1
                                    hover:bg-secondary
                                  "
                                  data-testid={`item-menu-${asset.id}`}
                                >
                                  <MoreVertical
                                    className="h-4 w-4 text-muted-foreground"
                                    strokeWidth={
                                      1.5
                                    }
                                  />
                                </button>
                              </DropdownMenuTrigger>

                              <DropdownMenuContent className="border-border bg-card">
                                <DropdownMenuItem
                                  onClick={(
                                    event
                                  ) => {
                                    event.stopPropagation();

                                    setEditAsset(
                                      asset
                                    );
                                  }}
                                  data-testid={`item-edit-${asset.id}`}
                                >
                                  <Pencil
                                    className="mr-2 h-3.5 w-3.5"
                                    strokeWidth={
                                      1.5
                                    }
                                  />

                                  Edit
                                </DropdownMenuItem>

                                <DropdownMenuItem
                                  onClick={(
                                    event
                                  ) => {
                                    event.stopPropagation();

                                    handleDelete(
                                      asset
                                    );
                                  }}
                                  className="text-rose-400"
                                  data-testid={`item-delete-${asset.id}`}
                                >
                                  <Trash2
                                    className="mr-2 h-3.5 w-3.5"
                                    strokeWidth={
                                      1.5
                                    }
                                  />

                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* =====================================
                        STOCK DETAILS
                    ===================================== */}

                    {expanded &&
                      hasDetails && (
                        <div
                          className="mb-2 ml-8 mt-2"
                          data-testid={`item-details-${asset.id}`}
                        >
                          <Card className="border-border/20 bg-secondary/20">
                            <CardContent className="px-4 py-3">
                              <div className="grid grid-cols-2 gap-4 text-xs sm:grid-cols-4">
                                <div>
                                  <p className="text-muted-foreground">
                                    Quantity
                                  </p>

                                  <p className="mt-0.5 font-mono text-foreground">
                                    {asset.quantity?.toLocaleString(
                                      undefined,
                                      {
                                        maximumFractionDigits:
                                          6,
                                      }
                                    )}
                                  </p>
                                </div>

                                <div>
                                  <p className="text-muted-foreground">
                                    Price
                                  </p>

                                  <p className="mt-0.5 font-mono text-foreground">
                                    {formatCurrency(
                                      asset.current_price ||
                                        0
                                    )}
                                  </p>
                                </div>

                                {asset.cost_basis >
                                  0 && (
                                  <div>
                                    <p className="text-muted-foreground">
                                      Cost Basis
                                    </p>

                                    <p className="mt-0.5 font-mono text-foreground">
                                      {formatCurrency(
                                        asset.cost_basis
                                      )}
                                    </p>
                                  </div>
                                )}

                                {asset.cost_basis >
                                  0 && (
                                  <div>
                                    <p className="text-muted-foreground">
                                      P/L
                                    </p>

                                    <p
                                      className={`mt-0.5 font-mono ${
                                        value -
                                          asset.cost_basis >=
                                        0
                                          ? "text-emerald-400"
                                          : "text-rose-400"
                                      }`}
                                    >
                                      {value -
                                        asset.cost_basis >=
                                      0
                                        ? "+"
                                        : ""}

                                      {formatCurrency(
                                        value -
                                          asset.cost_basis
                                      )}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}
                  </div>
                );
              }
            )}
          </div>
        )}

      {/* =================================================
          EDIT DIALOG
      ================================================= */}

      {editAsset && (
        <EditAssetDialog
          asset={
            editAsset
          }
          open={
            !!editAsset
          }
          onOpenChange={(
            open
          ) => {
            if (!open) {
              setEditAsset(
                null
              );
            }
          }}
          onUpdated={() => {
            setEditAsset(
              null
            );

            onUpdate?.();
          }}
        />
      )}
    </div>
  );
}