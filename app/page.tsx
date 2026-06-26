"use client";

import {
  CalendarDays,
  Download,
  FileText,
  Home,
  Pencil,
  Plus,
  Printer,
  Save,
  Settings,
  Trash2,
  Upload,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { calculateTotals, dateDiffDaysInclusive, findRule, lodgingNights, uid, yen } from "@/lib/calc";
import { defaultAirFares, defaultProfile, defaultRules } from "@/lib/data";
import { downloadExpensePdf, downloadReportPdf } from "@/lib/pdfGenerator";
import { AirFare, LodgingItem, Profile, TransportItem, TravelRule, Trip, TripCategory } from "@/lib/types";

const storageKeys = {
  profile: "travel-ai-profile",
  rules: "travel-ai-rules",
  trips: "travel-ai-trips",
  airFares: "travel-ai-air-fares",
};

const categories: TripCategory[] = ["国内近距離出張", "国内遠距離出張", "海外出張"];

const airportAliases: Record<string, string> = {
  ITM: "ITM",
  伊丹: "ITM",
  大阪: "ITM",
  大阪空港: "ITM",
  KIX: "KIX",
  関空: "KIX",
  関西: "KIX",
  関西空港: "KIX",
  関西国際空港: "KIX",
  HND: "HND",
  羽田: "HND",
  東京: "HND",
  羽田空港: "HND",
  FUK: "FUK",
  福岡: "FUK",
  福岡空港: "FUK",
  SDJ: "SDJ",
  仙台: "SDJ",
  仙台空港: "SDJ",
  CTS: "CTS",
  新千歳: "CTS",
  新千歳空港: "CTS",
  那覇: "OKA",
  OKA: "OKA",
  那覇空港: "OKA",
};

const normalizeAirport = (value: string) => {
  const compact = value.trim().replace(/\s+/g, "").toUpperCase();
  return airportAliases[compact] ?? airportAliases[value.trim().replace(/\s+/g, "")] ?? compact;
};

type SuggestOption = {
  value: string;
  keys: string[];
};

const suggestionKeywords: Record<string, string[]> = {
  関東: ["k", "kanto", "かんとう", "カ", "関", "t", "tokyo", "ト", "東京"],
  中部: ["c", "chubu", "ちゅうぶ", "チ", "中", "nagoya", "名古屋"],
  関西: ["k", "kansai", "かんさい", "カ", "関", "o", "osaka", "大阪"],
  中国: ["c", "chugoku", "ちゅうごく", "チ", "中", "hiroshima", "広島"],
  九州: ["k", "kyushu", "きゅうしゅう", "キ", "九", "f", "fukuoka", "福岡"],
  東北: ["t", "tohoku", "とうほく", "ト", "東", "sendai", "仙台"],
  北海道: ["h", "hokkaido", "ほっかいどう", "ホ", "北", "s", "sapporo", "札幌"],
  東京: ["t", "to", "tokyo", "とうきょう", "ト", "東"],
  大阪: ["o", "osaka", "おおさか", "オ", "大"],
  福岡: ["f", "fukuoka", "ふくおか", "フ", "福"],
  沖縄: ["o", "okinawa", "おきなわ", "オ", "沖"],
  札幌: ["s", "sapporo", "さっぽろ", "サ", "札"],
  羽田: ["h", "haneda", "はねだ", "ハ", "羽", "t", "tokyo"],
  伊丹: ["i", "itami", "いたみ", "イ", "伊", "o", "osaka"],
  関空: ["k", "kanku", "kix", "かんくう", "カ", "関", "o", "osaka"],
  仙台: ["s", "sendai", "せんだい", "セ", "仙", "sdj"],
  新千歳: ["s", "shin-chitose", "chitose", "しんちとせ", "シ", "新", "cts", "札幌"],
  那覇: ["n", "naha", "なは", "ナ", "那", "oka", "沖縄"],
  セミナー: ["s", "seminar", "せみなー", "セ"],
  商談: ["s", "shodan", "しょうだん", "シ", "商"],
  打ち合わせ: ["u", "uchiawase", "meeting", "う", "打"],
  展示会: ["t", "tenjikai", "てんじかい", "テ", "展"],
  視察: ["s", "shisatsu", "しさつ", "シ", "視"],
};

const normalizeSuggestText = (value: string) => value.trim().replace(/\s+/g, "").toLowerCase();

const toSuggestOption = (value: string): SuggestOption => ({
  value,
  keys: [value, ...(suggestionKeywords[value] ?? [])].map(normalizeSuggestText),
});

const uniqueOptions = (values: string[]) => {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      if (seen.has(value)) return false;
      seen.add(value);
      return true;
    })
    .map(toSuggestOption);
};

const filterSuggestions = (options: SuggestOption[], query: string) => {
  const normalized = normalizeSuggestText(query);
  const ranked = options
    .map((option, index) => {
      if (!normalized) return { option, score: 2, index };
      if (normalizeSuggestText(option.value).startsWith(normalized)) return { option, score: 0, index };
      if (option.keys.some((key) => key.startsWith(normalized))) return { option, score: 0, index };
      if (normalizeSuggestText(option.value).includes(normalized)) return { option, score: 1, index };
      if (option.keys.some((key) => key.includes(normalized))) return { option, score: 1, index };
      return null;
    })
    .filter((item): item is { option: SuggestOption; score: number; index: number } => Boolean(item))
    .sort((a, b) => a.score - b.score || a.index - b.index);

  return ranked.slice(0, 6).map((item) => item.option);
};

const visibleRouteAirports = ["伊丹", "羽田", "福岡", "仙台", "新千歳", "那覇"];

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day);
};

const formatDateInput = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addMonths = (date: Date, amount: number) => new Date(date.getFullYear(), date.getMonth() + amount, 1);

const airportLabels: Record<string, string> = {
  ITM: "伊丹",
  HND: "羽田",
  FUK: "福岡",
  SDJ: "仙台",
  CTS: "新千歳",
  OKA: "那覇",
  KIX: "関空",
};

const destinationAirportKeywords: Array<{ airport: string; keywords: string[] }> = [
  { airport: "HND", keywords: ["関東", "東京", "首都圏", "羽田", "神奈川", "横浜", "千葉", "埼玉"] },
  { airport: "FUK", keywords: ["九州", "福岡", "博多"] },
  { airport: "SDJ", keywords: ["東北", "仙台", "宮城"] },
  { airport: "CTS", keywords: ["北海道", "札幌", "新千歳"] },
  { airport: "OKA", keywords: ["沖縄", "那覇"] },
  { airport: "ITM", keywords: ["関西", "大阪", "伊丹"] },
];

const inferDestinationAirport = (destination: string) => {
  const normalized = destination.trim();
  return destinationAirportKeywords.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)))?.airport ?? "FUK";
};

const applyAirFare = (airFares: AirFare[], item: TransportItem, patch: Partial<TransportItem>): Partial<TransportItem> => {
  if ("amount" in patch) return patch;
  const next = { ...item, ...patch };
  if (next.type !== "飛行機" || next.fareType !== "フレックス") return patch;
  if (next.airline !== "JAL" && next.airline !== "ANA") return patch;

  const from = normalizeAirport(next.from);
  const to = normalizeAirport(next.to);
  const fare = airFares.find(
    (row) => row.airline === next.airline && row.fareType === next.fareType && row.from === from && row.to === to,
  );

  if (!fare) return patch;

  const autoNote = `${next.airline} ${fare.from}-${fare.to} フレックス参考額。実際の表示額に合わせて修正可。`;
  return {
    ...patch,
    amount: fare.amount,
    note: next.note ? next.note : autoNote,
  };
};

const flightNoPrefix = (airline: TransportItem["airline"]) => {
  if (airline === "JAL") return "JAL";
  if (airline === "ANA") return "NH";
  return "";
};

const applyFlightNoPrefix = (item: TransportItem, patch: Partial<TransportItem>): Partial<TransportItem> => {
  if (!("airline" in patch)) return patch;
  const prefix = flightNoPrefix(patch.airline ?? "");
  const currentAutoPrefix = item.flightNo === "JAL" || item.flightNo === "NH";
  if (!prefix) return currentAutoPrefix ? { ...patch, flightNo: "" } : patch;
  if (!item.flightNo || currentAutoPrefix) return { ...patch, flightNo: prefix };
  return patch;
};

const formatFlightNoInput = (airline: TransportItem["airline"], value: string) => {
  const prefix = flightNoPrefix(airline);
  if (!prefix) return value;
  const digits = value.replace(prefix, "").replace(/\D/g, "");
  return `${prefix}${digits}`;
};

const hasTransportContent = (item: TransportItem) => {
  const flightNoOnlyPrefix = item.flightNo === "JAL" || item.flightNo === "NH";
  return Boolean(item.from || item.to || item.amount || item.note || (item.flightNo && !flightNoOnlyPrefix));
};

const summarizeTripUsage = (items: Trip[]) =>
  items.reduce(
    (summary, item) => ({
      lodgingNights: summary.lodgingNights + item.lodgings.reduce((sum, lodging) => sum + lodgingNights(lodging), 0),
      flightCount: summary.flightCount + item.transports.filter((transport) => transport.type === "飛行機").length,
    }),
    { lodgingNights: 0, flightCount: 0 },
  );

const monthKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
};

const tripMonthKey = (trip: Trip) => trip.startDate.slice(0, 7);
const tripYearKey = (trip: Trip) => trip.startDate.slice(0, 4);

const buildAutoFlight = (airFares: AirFare[], date: string, from: string, to: string, note: string): TransportItem => {
  const base: TransportItem = {
    ...emptyTransport(date),
    airline: "JAL",
    from: airportLabels[from] ?? from,
    to: airportLabels[to] ?? to,
    note,
  };
  return { ...base, ...applyAirFare(airFares, base, {}) };
};

const emptyTransport = (date = new Date().toISOString().slice(0, 10)): TransportItem => ({
  id: uid(),
  date,
  type: "飛行機",
  airline: "JAL",
  flightNo: "JAL",
  from: "",
  to: "",
  fareType: "フレックス",
  amount: 0,
  note: "",
});

const emptyLodging = (amount = 0, startDate = "", endDate = ""): LodgingItem => ({
  id: uid(),
  startDate,
  endDate,
  place: "",
  amount,
  note: "",
});

const createTrip = (profile: Profile, rules: TravelRule[]): Trip => {
  const today = new Date().toISOString().slice(0, 10);
  const category = "国内遠距離出張" as TripCategory;
  const rule = findRule(rules, today, category, profile.title);

  return {
    id: uid(),
    createdAt: new Date().toISOString(),
    category,
    startDate: today,
    endDate: today,
    destination: "",
    purpose: "",
    note: "",
    reportMemo: "",
    reportText: "",
    profileSnapshot: profile,
    ruleSnapshot: rule ? { ...rule } : null,
    transports: [emptyTransport(today)],
    lodgings: [],
  };
};

const loadJson = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

export default function HomePage() {
  const [view, setView] = useState<"dashboard" | "form" | "settings" | "print-report" | "print-expense">("dashboard");
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [rules, setRules] = useState<TravelRule[]>(defaultRules);
  const [airFares, setAirFares] = useState<AirFare[]>(defaultAirFares);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [printBackView, setPrintBackView] = useState<"dashboard" | "form">("form");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setProfile(loadJson(storageKeys.profile, defaultProfile));
    setRules(loadJson(storageKeys.rules, defaultRules));
    setAirFares(loadJson(storageKeys.airFares, defaultAirFares));
    setTrips(loadJson(storageKeys.trips, []));
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(storageKeys.profile, JSON.stringify(profile));
    localStorage.setItem(storageKeys.rules, JSON.stringify(rules));
    localStorage.setItem(storageKeys.airFares, JSON.stringify(airFares));
    localStorage.setItem(storageKeys.trips, JSON.stringify(trips));
  }, [loaded, profile, rules, airFares, trips]);

  const activeTrip = trip ?? createTrip(profile, rules);
  const totals = useMemo(() => calculateTotals(activeTrip), [activeTrip]);
  const currentMonthKey = monthKey(new Date());
  const previousMonthKey = monthKey(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1));
  const sortedTrips = useMemo(
    () => [...trips].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.createdAt.localeCompare(a.createdAt)),
    [trips],
  );
  const monthTotal = useMemo(() => {
    return trips
      .filter((item) => tripMonthKey(item) === currentMonthKey)
      .reduce((sum, item) => sum + calculateTotals(item).grand, 0);
  }, [trips, currentMonthKey]);
  const monthUsage = useMemo(() => {
    return summarizeTripUsage(trips.filter((item) => tripMonthKey(item) === currentMonthKey));
  }, [trips, currentMonthKey]);
  const previousMonthTotal = useMemo(() => {
    return trips
      .filter((item) => tripMonthKey(item) === previousMonthKey)
      .reduce((sum, item) => sum + calculateTotals(item).grand, 0);
  }, [trips, previousMonthKey]);
  const previousMonthUsage = useMemo(() => {
    return summarizeTripUsage(trips.filter((item) => tripMonthKey(item) === previousMonthKey));
  }, [trips, previousMonthKey]);
  const yearTotal = useMemo(() => {
    const year = new Date().getFullYear().toString();
    return trips
      .filter((item) => tripYearKey(item) === year)
      .reduce((sum, item) => sum + calculateTotals(item).grand, 0);
  }, [trips]);
  const yearUsage = useMemo(() => {
    const year = new Date().getFullYear().toString();
    return summarizeTripUsage(trips.filter((item) => tripYearKey(item) === year));
  }, [trips]);

  const updateTrip = (patch: Partial<Trip>) => setTrip((current) => (current ? { ...current, ...patch } : null));

  const refreshRule = (next: Partial<Trip>) => {
    setTrip((current) => {
      if (!current) return current;
      const startDateChanged = typeof next.startDate === "string" && next.startDate !== current.startDate;
      const merged = { ...current, ...next };
      const rule = findRule(rules, merged.startDate, merged.category, profile.title);

      if (startDateChanged) {
        merged.transports = merged.transports.map((item, index) =>
          index === 0 ? { ...item, date: merged.startDate } : item,
        );
        merged.lodgings = merged.lodgings.map((item, index) =>
          index === 0
            ? {
                ...item,
                startDate: merged.startDate,
                amount:
                  rule && lodgingNights({ ...item, startDate: merged.startDate }) > 0
                    ? rule.lodging * lodgingNights({ ...item, startDate: merged.startDate })
                    : item.amount,
              }
            : item,
        );
      }

      return {
        ...merged,
        profileSnapshot: { ...profile },
        ruleSnapshot: rule ? { ...rule } : null,
      };
    });
  };

  const saveTrip = () => {
    if (!trip) return;
    const normalized = {
      ...trip,
      profileSnapshot: { ...profile },
      ruleSnapshot: trip.ruleSnapshot ? { ...trip.ruleSnapshot } : null,
      reportText: trip.reportText || buildReportText(trip),
    };
    setTrips((items) => {
      const exists = items.some((item) => item.id === normalized.id);
      return exists ? items.map((item) => (item.id === normalized.id ? normalized : item)) : [normalized, ...items];
    });
    setTrip(normalized);
    setView("dashboard");
  };

  const startNew = () => {
    setTrip(createTrip(profile, rules));
    setView("form");
  };

  const editTrip = (target: Trip) => {
    setTrip(target);
    setView("form");
  };

  const deleteTrip = (id: string) => {
    if (!confirm("この出張データを削除しますか？")) return;
    setTrips((items) => items.filter((item) => item.id !== id));
  };

  if (view === "print-report" && trip) {
    return <ReportPrint trip={trip} onBack={() => setView(printBackView)} />;
  }

  if (view === "print-expense" && trip) {
    return <ExpensePrint trip={trip} onBack={() => setView(printBackView)} />;
  }

  return (
    <main className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div>
            <p className="text-xs font-semibold text-moss">Travel AI</p>
            <h1 className="text-lg font-bold text-ink">出張報告・旅費申請</h1>
          </div>
          <nav className="flex gap-2">
            <IconButton label="ホーム" onClick={() => setView("dashboard")} active={view === "dashboard"}>
              <Home size={20} />
            </IconButton>
            <IconButton label="設定" onClick={() => setView("settings")} active={view === "settings"}>
              <Settings size={20} />
            </IconButton>
          </nav>
        </div>
      </header>

      {view === "dashboard" && (
        <section className="mx-auto max-w-6xl px-4 py-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <button
              onClick={startNew}
              className="flex min-h-24 items-center justify-center gap-3 rounded-lg bg-moss px-5 py-4 text-lg font-bold text-white shadow-soft"
            >
              <Plus size={24} /> 新規出張作成
            </button>
            <SummaryCard
              label="今月の旅費合計"
              value={yen(monthTotal)}
              details={[
                ["宿泊数", `${monthUsage.lodgingNights}泊`],
                ["搭乗回数", `${monthUsage.flightCount}回`],
              ]}
            />
            <SummaryCard
              label="先月の旅費合計"
              value={yen(previousMonthTotal)}
              details={[
                ["宿泊数", `${previousMonthUsage.lodgingNights}泊`],
                ["搭乗回数", `${previousMonthUsage.flightCount}回`],
              ]}
            />
            <SummaryCard
              label="今年の旅費合計"
              value={yen(yearTotal)}
              details={[
                ["宿泊数", `${yearUsage.lodgingNights}泊`],
                ["搭乗回数", `${yearUsage.flightCount}回`],
              ]}
            />
          </div>

          <div className="mt-6">
            <SectionTitle icon={<CalendarDays size={20} />} title="過去の出張一覧" />
            <div className="mt-3 overflow-hidden rounded-lg border border-line bg-white">
              {trips.length === 0 ? (
                <div className="p-6 text-sm text-slate-600">保存済みの出張データはまだありません。</div>
              ) : (
                <div className="divide-y divide-line">
                  {sortedTrips.map((item) => {
                    const itemTotals = calculateTotals(item);
                    return (
                      <article key={item.id} className="grid gap-3 p-4 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
                        <div>
                          <p className="font-bold">{item.destination || "出張先未入力"}</p>
                          <p className="text-sm text-slate-600">
                            {item.startDate} - {item.endDate} / {item.category}
                          </p>
                          <p className="mt-1 text-sm">{item.purpose || "目的未入力"}</p>
                        </div>
                        <div className="text-sm">
                          <p className="font-bold text-coral">{yen(itemTotals.grand)}</p>
                          <p className="text-slate-600">作成日 {item.createdAt.slice(0, 10)}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <IconButton label="編集" onClick={() => editTrip(item)}>
                            <Pencil size={18} />
                          </IconButton>
                          <HistoryPdfButton
                            label="報告書"
                            icon={<FileText size={18} />}
                            onClick={() => {
                              downloadReportPdf({ ...item, reportText: item.reportText || buildReportText(item) });
                            }}
                          />
                          <HistoryPdfButton
                            label="精算書"
                            icon={<Download size={18} />}
                            onClick={() => {
                              downloadExpensePdf({ ...item, reportText: item.reportText || buildReportText(item) });
                            }}
                          />
                          <IconButton label="削除" onClick={() => deleteTrip(item.id)}>
                            <Trash2 size={18} />
                          </IconButton>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {view === "settings" && (
        <SettingsView
          profile={profile}
          setProfile={setProfile}
          rules={rules}
          setRules={setRules}
          airFares={airFares}
          setAirFares={setAirFares}
          trips={trips}
          setTrips={setTrips}
        />
      )}

      {view === "form" && trip && (
        <TripForm
          trip={trip}
          savedTrips={trips}
          airFares={airFares}
          totals={totals}
          onChange={updateTrip}
          refreshRule={refreshRule}
          onSave={saveTrip}
          onReport={() => {
            const outputTrip = { ...trip, reportText: trip.reportText || buildReportText(trip) };
            setTrip(outputTrip);
            downloadReportPdf(outputTrip);
          }}
          onExpense={() => {
            const outputTrip = { ...trip, reportText: trip.reportText || buildReportText(trip) };
            setTrip(outputTrip);
            downloadExpensePdf(outputTrip);
          }}
        />
      )}
    </main>
  );
}

function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={`grid h-11 w-11 place-items-center rounded-lg border border-line ${
        active ? "bg-ink text-white" : "bg-white text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function HistoryPdfButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      title={`${label}PDF`}
      aria-label={`${label}PDF`}
      onClick={onClick}
      className="flex h-11 min-w-24 items-center justify-center gap-2 rounded-lg border border-line bg-white px-3 text-sm font-bold text-ink"
    >
      {icon}
      {label}
    </button>
  );
}

function SummaryCard({ label, value, details = [] }: { label: string; value: string; details?: string[][] }) {
  return (
    <div className="rounded-lg border border-line bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
      {details.length > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-line pt-3 text-sm">
          {details.map(([detailLabel, detailValue]) => (
            <div key={detailLabel}>
              <p className="text-xs text-slate-500">{detailLabel}</p>
              <p className="font-bold text-ink">{detailValue}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-lg font-bold">{title}</h2>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid min-w-0 gap-1 text-sm font-semibold text-ink">
      {label}
      {children}
    </label>
  );
}

const inputClass =
  "min-h-12 w-full min-w-0 max-w-full rounded-lg border border-line bg-white px-3 py-2 text-base outline-none focus:border-moss focus:ring-2 focus:ring-moss/20";

function SuggestInput({
  value,
  onChange,
  suggestions,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  suggestions: SuggestOption[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const filtered = filterSuggestions(suggestions, value);

  return (
    <div className="relative">
      <input
        className={inputClass}
        placeholder={placeholder}
        value={value}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
        }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 grid gap-1 rounded-lg border border-line bg-white p-2 shadow-soft">
          {filtered.map((option) => (
            <button
              key={option.value}
              type="button"
              className="min-h-10 rounded-md px-3 text-left text-sm font-semibold hover:bg-skysoft"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.value}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DateRangePicker({
  startDate,
  endDate,
  onChange,
}: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
}) {
  const [displayMonth, setDisplayMonth] = useState(() => {
    const base = startDate ? parseLocalDate(startDate) : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [pendingStart, setPendingStart] = useState<string | null>(null);

  useEffect(() => {
    if (!startDate) return;
    const base = parseLocalDate(startDate);
    setDisplayMonth(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [startDate]);

  const monthStart = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), 1);
  const daysInMonth = new Date(displayMonth.getFullYear(), displayMonth.getMonth() + 1, 0).getDate();
  const blanks = Array.from({ length: monthStart.getDay() });
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(displayMonth.getFullYear(), displayMonth.getMonth(), index + 1);
    return formatDateInput(date);
  });
  const rangeStart = startDate && endDate && startDate <= endDate ? startDate : endDate;
  const rangeEnd = startDate && endDate && startDate <= endDate ? endDate : startDate;

  const selectDate = (date: string) => {
    if (!pendingStart) {
      setPendingStart(date);
      onChange(date, date);
      return;
    }
    const nextStart = pendingStart <= date ? pendingStart : date;
    const nextEnd = pendingStart <= date ? date : pendingStart;
    setPendingStart(null);
    onChange(nextStart, nextEnd);
  };

  return (
    <div className="grid gap-2 rounded-lg border border-line bg-paper p-3">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="min-h-10 rounded-lg border border-line bg-white px-3 font-bold" onClick={() => setDisplayMonth(addMonths(displayMonth, -1))}>
          前月
        </button>
        <p className="text-center font-bold">
          {displayMonth.getFullYear()}年 {displayMonth.getMonth() + 1}月
        </p>
        <button type="button" className="min-h-10 rounded-lg border border-line bg-white px-3 font-bold" onClick={() => setDisplayMonth(addMonths(displayMonth, 1))}>
          翌月
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-slate-500">
        {["日", "月", "火", "水", "木", "金", "土"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {blanks.map((_, index) => (
          <span key={`blank-${index}`} />
        ))}
        {days.map((date) => {
          const isEdge = date === startDate || date === endDate || date === pendingStart;
          const isInRange = rangeStart && rangeEnd && date >= rangeStart && date <= rangeEnd;
          return (
            <button
              key={date}
              type="button"
              className={`min-h-11 rounded-lg text-sm font-bold ${
                isEdge
                  ? "bg-moss text-white"
                  : isInRange
                    ? "bg-moss/15 text-ink"
                    : "border border-line bg-white text-ink"
              }`}
              onClick={() => selectDate(date)}
            >
              {Number(date.slice(-2))}
            </button>
          );
        })}
      </div>
      <p className="text-xs text-slate-600">
        {pendingStart ? "終了日をタップしてください。" : "開始日をタップして、次に終了日をタップします。"}
      </p>
    </div>
  );
}

function TripForm({
  trip,
  savedTrips,
  airFares,
  totals,
  onChange,
  refreshRule,
  onSave,
  onReport,
  onExpense,
}: {
  trip: Trip;
  savedTrips: Trip[];
  airFares: AirFare[];
  totals: ReturnType<typeof calculateTotals>;
  onChange: (patch: Partial<Trip>) => void;
  refreshRule: (patch: Partial<Trip>) => void;
  onSave: () => void;
  onReport: () => void;
  onExpense: () => void;
}) {
  const rule = trip.ruleSnapshot;
  const destinationSuggestions = useMemo(
    () =>
      uniqueOptions([
        "関東",
        "中部",
        "関西",
        "中国",
        "九州",
        "東北",
        "北海道",
        ...savedTrips.map((item) => item.destination),
      ]),
    [savedTrips],
  );
  const purposeSuggestions = useMemo(
    () =>
      uniqueOptions([
        "セミナー",
        "商談",
        "打ち合わせ",
        "展示会",
        "視察",
        ...savedTrips.map((item) => item.purpose),
      ]),
    [savedTrips],
  );
  const routeSuggestions = useMemo(
    () =>
      uniqueOptions([
        ...visibleRouteAirports,
        ...savedTrips
          .flatMap((item) => item.transports.flatMap((transport) => [transport.from, transport.to]))
          .filter((value) => visibleRouteAirports.includes(value)),
      ]),
    [savedTrips],
  );

  const setTransport = (id: string, patch: Partial<TransportItem>) =>
    onChange({
      transports: trip.transports.map((item) =>
        item.id === id ? { ...item, ...applyAirFare(airFares, item, applyFlightNoPrefix(item, patch)) } : item,
      ),
    });
  const createRoundTripTransports = () => {
    const destinationAirport = inferDestinationAirport(trip.destination);
    const outbound = buildAutoFlight(airFares, trip.startDate, "ITM", destinationAirport, "往路");
    const inbound = buildAutoFlight(airFares, trip.endDate || trip.startDate, destinationAirport, "ITM", "復路");
    const filledTransports = trip.transports.filter(hasTransportContent);
    onChange({ transports: [...filledTransports, outbound, inbound] });
  };

  const applyLodgingAmount = (item: LodgingItem, patch: Partial<LodgingItem>): Partial<LodgingItem> => {
    if ("amount" in patch) return patch;
    const next = { ...item, ...patch };
    const nights = lodgingNights(next);
    return { ...patch, amount: nights > 0 && rule ? rule.lodging * nights : 0 };
  };

  const setLodging = (id: string, patch: Partial<LodgingItem>) =>
    onChange({
      lodgings: trip.lodgings.map((item) =>
        item.id === id ? { ...item, ...applyLodgingAmount(item, patch) } : item,
      ),
    });

  return (
    <section className="mx-auto max-w-6xl px-4 py-5">
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-5">
          <Panel title="基本情報">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="出張区分">
                <select className={inputClass} value={trip.category} onChange={(event) => refreshRule({ category: event.target.value as TripCategory })}>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </Field>
              <Field label="出張先">
                <SuggestInput
                  value={trip.destination}
                  suggestions={destinationSuggestions}
                  onChange={(value) => onChange({ destination: value })}
                />
              </Field>
              <Field label="出張期間開始日">
                <input className={inputClass} type="date" value={trip.startDate} onChange={(event) => refreshRule({ startDate: event.target.value })} />
              </Field>
              <Field label="出張期間終了日">
                <input className={inputClass} type="date" value={trip.endDate} onChange={(event) => onChange({ endDate: event.target.value })} />
              </Field>
              <div className="sm:col-span-2">
                <DateRangePicker
                  startDate={trip.startDate}
                  endDate={trip.endDate}
                  onChange={(startDate, endDate) => refreshRule({ startDate, endDate })}
                />
              </div>
              <Field label="出張目的">
                <SuggestInput
                  value={trip.purpose}
                  suggestions={purposeSuggestions}
                  onChange={(value) => onChange({ purpose: value })}
                />
              </Field>
              <Field label="備考">
                <input className={inputClass} value={trip.note} onChange={(event) => onChange({ note: event.target.value })} />
              </Field>
            </div>
          </Panel>

          <Panel title="交通費">
            <div className="grid gap-3">
              <button
                type="button"
                className="min-h-12 rounded-lg bg-ink px-4 font-bold text-white"
                onClick={createRoundTripTransports}
              >
                往路・復路を作成
              </button>
              {trip.transports.map((item) => (
                <div key={item.id} className="grid gap-2 rounded-lg border border-line bg-paper p-3">
                  <div className="grid gap-2 sm:grid-cols-4">
                    <input className={inputClass} type="date" value={item.date} onChange={(event) => setTransport(item.id, { date: event.target.value })} />
                    <select className={inputClass} value={item.type} onChange={(event) => setTransport(item.id, { type: event.target.value as TransportItem["type"] })}>
                      {["飛行機", "新幹線", "電車", "タクシー", "その他"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                    <select className={inputClass} value={item.airline} onChange={(event) => setTransport(item.id, { airline: event.target.value as TransportItem["airline"] })}>
                      {["", "JAL", "ANA", "その他"].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                    <input
                      className={inputClass}
                      inputMode={item.airline === "JAL" || item.airline === "ANA" ? "numeric" : "text"}
                      placeholder="便名"
                      value={item.flightNo}
                      onChange={(event) => setTransport(item.id, { flightNo: formatFlightNoInput(item.airline, event.target.value) })}
                    />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-5">
                    <SuggestInput
                      placeholder="発地"
                      value={item.from}
                      suggestions={routeSuggestions}
                      onChange={(value) => setTransport(item.id, { from: value })}
                    />
                    <SuggestInput
                      placeholder="着地"
                      value={item.to}
                      suggestions={routeSuggestions}
                      onChange={(value) => setTransport(item.id, { to: value })}
                    />
                    <select className={inputClass} value={item.fareType} onChange={(event) => setTransport(item.id, { fareType: event.target.value as TransportItem["fareType"] })}>
                      <option>フレックス</option>
                      <option>その他</option>
                    </select>
                    <input className={inputClass} type="number" inputMode="numeric" placeholder="金額" value={item.amount || ""} onChange={(event) => setTransport(item.id, { amount: Number(event.target.value) })} />
                    <button
                      type="button"
                      className="min-h-12 rounded-lg border border-line bg-white font-bold"
                      onClick={() => onChange({ transports: trip.transports.filter((row) => row.id !== item.id) })}
                    >
                      削除
                    </button>
                  </div>
                  <input className={inputClass} placeholder="備考" value={item.note} onChange={(event) => setTransport(item.id, { note: event.target.value })} />
                </div>
              ))}
              <button type="button" className="min-h-12 rounded-lg border border-line bg-white font-bold" onClick={() => onChange({ transports: [...trip.transports, emptyTransport(trip.endDate || trip.startDate)] })}>
                ＋ 交通費を追加
              </button>
            </div>
          </Panel>

          <Panel title="宿泊費">
            <div className="grid gap-3">
              {trip.lodgings.map((item) => (
                <div key={item.id} className="grid gap-2 rounded-lg border border-line bg-paper p-3">
                  <div className="grid gap-2 sm:grid-cols-5">
                    <input
                      className={inputClass}
                      type="date"
                      value={item.startDate}
                      onFocus={() => {
                        if (!item.startDate) setLodging(item.id, { startDate: trip.startDate });
                      }}
                      onClick={() => {
                        if (!item.startDate) setLodging(item.id, { startDate: trip.startDate });
                      }}
                      onChange={(event) => setLodging(item.id, { startDate: event.target.value })}
                    />
                    <input className={inputClass} type="date" value={item.endDate} onChange={(event) => setLodging(item.id, { endDate: event.target.value })} />
                    <input className={inputClass} placeholder="宿泊先" value={item.place} onChange={(event) => setLodging(item.id, { place: event.target.value })} />
                    <input className={inputClass} type="number" inputMode="numeric" value={item.amount || ""} onChange={(event) => setLodging(item.id, { amount: Number(event.target.value) })} />
                    <button type="button" className="min-h-12 rounded-lg border border-line bg-white font-bold" onClick={() => onChange({ lodgings: trip.lodgings.filter((row) => row.id !== item.id) })}>
                      削除
                    </button>
                  </div>
                  <input className={inputClass} placeholder="備考" value={item.note} onChange={(event) => setLodging(item.id, { note: event.target.value })} />
                </div>
              ))}
              <button
                type="button"
                className="min-h-12 rounded-lg border border-line bg-white font-bold"
                onClick={() => {
                  const lodging = emptyLodging(0, trip.startDate, trip.endDate);
                  const nights = lodgingNights(lodging);
                  onChange({
                    lodgings: [
                      ...trip.lodgings,
                      { ...lodging, amount: rule && nights > 0 ? rule.lodging * nights : 0 },
                    ],
                  });
                }}
              >
                ＋ 宿泊費を追加
              </button>
            </div>
          </Panel>

          <Panel title="報告メモ・報告事項">
            <div className="grid gap-3">
              <Field label="報告メモ">
                <textarea
                  className={`${inputClass} min-h-56 leading-7 sm:min-h-40`}
                  placeholder="スマホのマイク入力で、出張中のメモをそのまま話して入力できます。"
                  value={trip.reportMemo}
                  onChange={(event) => onChange({ reportMemo: event.target.value })}
                />
              </Field>
              <button type="button" className="min-h-12 rounded-lg bg-ink px-4 font-bold text-white" onClick={() => onChange({ reportText: buildReportText(trip) })}>
                報告文を整形
              </button>
              <Field label="報告事項">
                <textarea className={`${inputClass} min-h-40`} value={trip.reportText} onChange={(event) => onChange({ reportText: event.target.value })} />
              </Field>
            </div>
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="grid gap-4 rounded-lg border border-line bg-white p-4 shadow-soft">
            <SectionTitle icon={<WalletCards size={20} />} title="適用旅費規程" />
            <div className="grid gap-2 text-sm">
              <Info label="会社名" value={trip.profileSnapshot.companyName} />
              <Info label="氏名" value={trip.profileSnapshot.name} />
              <Info label="所属" value={trip.profileSnapshot.department} />
              <Info label="役職" value={trip.profileSnapshot.title} />
            </div>
            {rule ? (
              <div className="grid gap-2 rounded-lg bg-skysoft p-3 text-sm">
                <Info label="日当" value={yen(rule.perDiem)} />
                <Info label="宿泊費" value={yen(rule.lodging)} />
                <Info label="渡航支度金" value={yen(rule.preparation)} />
                <Info label="航空機" value={rule.flightClass} />
                <Info label="鉄道" value={rule.railClass} />
                <Info label="船舶" value={rule.shipClass} />
              </div>
            ) : (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">該当する旅費規程がありません。設定画面で登録してください。</div>
            )}
            <div className="grid gap-2 border-t border-line pt-3 text-sm">
              <Info label="出張日数" value={`${totals.tripDays}日`} />
              <Info label="交通費小計" value={yen(totals.transport)} />
              <Info label="宿泊費小計" value={yen(totals.lodging)} />
              <Info label="日当小計" value={yen(totals.perDiem)} />
              <Info label="渡航支度金" value={yen(totals.preparation)} />
              <div className="flex items-center justify-between rounded-lg bg-coral px-3 py-3 text-white">
                <span className="font-bold">旅費総額</span>
                <span className="text-xl font-bold">{yen(totals.grand)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ActionButton onClick={onSave} icon={<Save size={18} />} label="保存" />
              <ActionButton onClick={onReport} icon={<FileText size={18} />} label="報告書PDF" />
              <ActionButton onClick={onExpense} icon={<Download size={18} />} label="精算書PDF" />
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-4">
      <h2 className="mb-3 text-lg font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-slate-600">{label}</span>
      <span className="text-right font-semibold">{value || "-"}</span>
    </div>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-lg bg-moss px-2 text-sm font-bold text-white sm:gap-2 sm:px-3">
      {icon}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SettingsView({
  profile,
  setProfile,
  rules,
  setRules,
  airFares,
  setAirFares,
  trips,
  setTrips,
}: {
  profile: Profile;
  setProfile: (profile: Profile) => void;
  rules: TravelRule[];
  setRules: (rules: TravelRule[]) => void;
  airFares: AirFare[];
  setAirFares: (airFares: AirFare[]) => void;
  trips: Trip[];
  setTrips: (trips: Trip[]) => void;
}) {
  const backupInputRef = useRef<HTMLInputElement>(null);
  const updateRule = (id: string, patch: Partial<TravelRule>) =>
    setRules(rules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)));
  const updateAirFare = (id: string, patch: Partial<AirFare>) =>
    setAirFares(airFares.map((fare) => (fare.id === id ? { ...fare, ...patch } : fare)));
  const addAirFare = () =>
    setAirFares([
      ...airFares,
      {
        id: uid(),
        airline: "JAL",
        from: "ITM",
        to: "HND",
        fareType: "フレックス",
        amount: 0,
        note: "追加登録",
      },
    ]);
  const exportBackup = () => {
    const backup = {
      app: "Travel AI",
      version: 1,
      exportedAt: new Date().toISOString(),
      profile,
      rules,
      airFares,
      trips,
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `travel-ai-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const importBackup = async (file: File | undefined) => {
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text()) as Partial<{
        profile: Profile;
        rules: TravelRule[];
        airFares: AirFare[];
        trips: Trip[];
      }>;
      if (!backup.profile || !Array.isArray(backup.rules) || !Array.isArray(backup.airFares) || !Array.isArray(backup.trips)) {
        alert("Travel AIのバックアップファイルとして読み込めませんでした。");
        return;
      }
      if (!confirm("バックアップを読み込むと、現在の保存データが置き換わります。読み込みますか？")) return;
      setProfile(backup.profile);
      setRules(backup.rules);
      setAirFares(backup.airFares);
      setTrips(backup.trips);
      alert("バックアップを読み込みました。");
    } catch {
      alert("バックアップファイルの読み込みに失敗しました。");
    } finally {
      if (backupInputRef.current) backupInputRef.current.value = "";
    }
  };

  return (
    <section className="mx-auto grid max-w-6xl gap-5 px-4 py-5">
      <Panel title="プロフィール">
        <div className="grid gap-3 sm:grid-cols-2">
          {(["companyName", "name", "department", "title"] as const).map((key) => (
            <Field key={key} label={{ companyName: "会社名", name: "氏名", department: "所属", title: "役職" }[key]}>
              <input className={inputClass} value={profile[key]} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} />
            </Field>
          ))}
        </div>
      </Panel>
      <Panel title="保存データのバックアップ">
        <div className="grid gap-3">
          <div className="rounded-lg bg-skysoft p-3 text-sm text-slate-700">
            プロフィール、旅費規程、航空運賃、過去の出張一覧をまとめて保存できます。MacBookで使うときや、万一に備えるときに使います。
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-ink px-4 font-bold text-white" onClick={exportBackup}>
              <Download size={18} />
              バックアップを書き出す
            </button>
            <button type="button" className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-line bg-white px-4 font-bold" onClick={() => backupInputRef.current?.click()}>
              <Upload size={18} />
              バックアップを読み込む
            </button>
          </div>
          <input
            ref={backupInputRef}
            className="hidden"
            type="file"
            accept="application/json,.json"
            onChange={(event) => void importBackup(event.target.files?.[0])}
          />
        </div>
      </Panel>
      <Panel title="旅費規程マスタ">
        <div className="grid gap-3">
          {rules.map((rule) => (
            <div key={rule.id} className="grid gap-2 rounded-lg border border-line bg-paper p-3">
              <div className="grid gap-2 md:grid-cols-4">
                <input className={inputClass} type="date" value={rule.startDate} onChange={(event) => updateRule(rule.id, { startDate: event.target.value })} />
                <input className={inputClass} type="date" value={rule.endDate} onChange={(event) => updateRule(rule.id, { endDate: event.target.value })} />
                <select className={inputClass} value={rule.category} onChange={(event) => updateRule(rule.id, { category: event.target.value as TripCategory })}>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
                <input className={inputClass} value={rule.title} onChange={(event) => updateRule(rule.id, { title: event.target.value })} />
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <input className={inputClass} type="number" value={rule.perDiem} onChange={(event) => updateRule(rule.id, { perDiem: Number(event.target.value) })} />
                <input className={inputClass} type="number" value={rule.lodging} onChange={(event) => updateRule(rule.id, { lodging: Number(event.target.value) })} />
                <input className={inputClass} type="number" value={rule.preparation} onChange={(event) => updateRule(rule.id, { preparation: Number(event.target.value) })} />
                <input className={inputClass} value={rule.note} onChange={(event) => updateRule(rule.id, { note: event.target.value })} />
              </div>
              <div className="grid gap-2 md:grid-cols-4">
                <input className={inputClass} value={rule.flightClass} onChange={(event) => updateRule(rule.id, { flightClass: event.target.value })} />
                <input className={inputClass} value={rule.railClass} onChange={(event) => updateRule(rule.id, { railClass: event.target.value })} />
                <input className={inputClass} value={rule.shipClass} onChange={(event) => updateRule(rule.id, { shipClass: event.target.value })} />
                <button type="button" className="min-h-12 rounded-lg border border-line bg-white font-bold" onClick={() => setRules(rules.filter((item) => item.id !== rule.id))}>
                  削除
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="min-h-12 rounded-lg bg-ink px-4 font-bold text-white"
            onClick={() =>
              setRules([
                ...rules,
                {
                  ...defaultRules[0],
                  id: uid(),
                  startDate: new Date().toISOString().slice(0, 10),
                  endDate: "2099-12-31",
                  note: "追加登録",
                },
              ])
            }
          >
            ＋ 規程を追加
          </button>
        </div>
      </Panel>
      <Panel title="航空運賃マスタ">
        <div className="grid gap-3">
          <div className="rounded-lg bg-skysoft p-3 text-sm text-slate-700">
            飛行機でJALまたはANA、運賃種別「フレックス」を選んだとき、この金額が交通費に自動入力されます。実際の航空券画面と違う場合は、ここで金額を直せます。
          </div>
          {airFares.map((fare) => (
            <div key={fare.id} className="grid gap-2 rounded-lg border border-line bg-paper p-3">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                <Field label="航空会社">
                  <select className={inputClass} value={fare.airline} onChange={(event) => updateAirFare(fare.id, { airline: event.target.value as AirFare["airline"] })}>
                    <option>JAL</option>
                    <option>ANA</option>
                  </select>
                </Field>
                <Field label="発地">
                  <select className={inputClass} value={fare.from} onChange={(event) => updateAirFare(fare.id, { from: event.target.value })}>
                    {Object.entries(airportLabels)
                      .filter(([code]) => code !== "KIX")
                      .map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="着地">
                  <select className={inputClass} value={fare.to} onChange={(event) => updateAirFare(fare.id, { to: event.target.value })}>
                    {Object.entries(airportLabels)
                      .filter(([code]) => code !== "KIX")
                      .map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="金額">
                  <input className={inputClass} type="number" inputMode="numeric" value={fare.amount || ""} onChange={(event) => updateAirFare(fare.id, { amount: Number(event.target.value) })} />
                </Field>
                <button type="button" className="min-h-12 self-end rounded-lg border border-line bg-white font-bold" onClick={() => setAirFares(airFares.filter((item) => item.id !== fare.id))}>
                  削除
                </button>
              </div>
              <input className={inputClass} placeholder="備考" value={fare.note} onChange={(event) => updateAirFare(fare.id, { note: event.target.value })} />
              <p className="text-xs text-slate-500">
                {fare.airline} {airportLabels[fare.from] ?? fare.from} → {airportLabels[fare.to] ?? fare.to} / フレックス
              </p>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="min-h-12 rounded-lg bg-ink px-4 font-bold text-white" onClick={addAirFare}>
              ＋ 運賃を追加
            </button>
            <button type="button" className="min-h-12 rounded-lg border border-line bg-white px-4 font-bold" onClick={() => setAirFares(defaultAirFares)}>
              初期運賃に戻す
            </button>
          </div>
        </div>
      </Panel>
    </section>
  );
}

function polishMemoLine(line: string) {
  const cleaned = line
    .replace(/^[-・*\s]+/, "")
    .replace(/[。.!！]+$/, "")
    .trim();

  if (!cleaned) return "関係者との確認事項を整理し、今後の対応方針を確認。";
  if (/確認$/.test(cleaned)) {
    return `${cleaned}し、必要事項を整理。`;
  }
  if (/整理$/.test(cleaned)) {
    return `${cleaned}し、業務上の確認事項を整理。`;
  }
  if (/共有$/.test(cleaned)) {
    return `${cleaned}し、関係者間で認識を合わせた。`;
  }
  if (/調整$/.test(cleaned)) {
    return `${cleaned}し、今後の進行に必要な条件を確認。`;
  }
  if (/協議|打ち合わせ|打合せ|面談|訪問|商談/.test(cleaned)) {
    return `${cleaned}を実施し、必要事項を確認。`;
  }
  if (/提出|受領|説明|検討|対応|作成|更新/.test(cleaned)) {
    return `${cleaned}し、業務上の確認事項を整理。`;
  }
  return `${cleaned}について確認し、今後の対応に必要な情報を整理。`;
}

function buildReportText(trip: Trip) {
  const lines = trip.reportMemo
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const period = trip.startDate === trip.endDate ? trip.startDate : `${trip.startDate} - ${trip.endDate}`;
  const destination = trip.destination || "出張先";
  const purpose = trip.purpose || "出張目的";

  if (lines.length === 0) {
    return `【${period}】\n・${destination}にて、${purpose}に関する業務を実施。\n・関係者との確認事項を整理し、今後の対応方針を確認。`;
  }

  const body = lines.map((line) => `・${polishMemoLine(line)}`).join("\n");
  return `【${period}】\n出張先：${destination}\n目的：${purpose}\n\n${body}\n・上記内容を踏まえ、必要な対応を継続する。`;
}

function safeFileName(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "_").replace(/\s+/g, "_");
}

function PrintShell({ title, fileName, onBack, children }: { title: string; fileName: string; onBack: () => void; children: React.ReactNode }) {
  const printTitle = safeFileName(fileName);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = printTitle;
    return () => {
      document.title = previousTitle;
    };
  }, [printTitle]);

  const handlePrint = () => {
    document.title = printTitle;
    window.print();
  };

  return (
    <main className="min-h-screen bg-neutral-200 p-3">
      <div className="no-print mx-auto mb-3 flex max-w-[210mm] justify-between gap-2">
        <button className="min-h-11 rounded-lg bg-white px-4 font-bold" onClick={onBack}>戻る</button>
        <button className="flex min-h-11 items-center gap-2 rounded-lg bg-ink px-4 font-bold text-white" onClick={handlePrint}>
          <Printer size={18} /> PDF保存画面を開く
        </button>
      </div>
      <section className="print-page mx-auto min-h-[297mm] w-full max-w-[210mm] bg-white p-[14mm] shadow-soft">
        <h1 className="mb-6 text-center text-2xl font-bold">{title}</h1>
        {children}
      </section>
    </main>
  );
}

function ReportPrint({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  return (
    <PrintShell title="出張報告書" fileName={`出張報告書_${trip.startDate}_${trip.destination || "出張先"}`} onBack={onBack}>
      <PrintInfo rows={[["氏名", trip.profileSnapshot.name], ["役職", trip.profileSnapshot.title]]} />
      <h2 className="mt-6 border-b border-black pb-1 font-bold">報告概要</h2>
      <PrintInfo rows={[["出張期間", `${trip.startDate} - ${trip.endDate}`], ["出張地域", trip.destination], ["出張目的", trip.purpose]]} />
      <h2 className="mt-6 border-b border-black pb-1 font-bold">報告事項</h2>
      <pre className="mt-3 whitespace-pre-wrap text-sm leading-7">{trip.reportText || buildReportText(trip)}</pre>
      <div className="mt-10 grid grid-cols-2 gap-6 text-sm">
        <div className="border border-black p-3">上席確認欄<br /><br /><br /></div>
        <div className="border border-black p-3">最終確認欄<br /><br /><br /></div>
      </div>
      <footer className="mt-10 flex justify-between text-sm">
        <span>{trip.profileSnapshot.companyName}</span>
        <span>1</span>
      </footer>
    </PrintShell>
  );
}

function ExpensePrint({ trip, onBack }: { trip: Trip; onBack: () => void }) {
  const totals = calculateTotals(trip);
  const rule = trip.ruleSnapshot;

  return (
    <PrintShell title="出張旅費 精算書" fileName={`出張旅費精算書_${trip.startDate}_${trip.destination || "出張先"}`} onBack={onBack}>
      <PrintInfo
        rows={[
          ["提出日", new Date().toISOString().slice(0, 10)],
          ["出張先", trip.destination],
          ["氏名", trip.profileSnapshot.name],
          ["役職", trip.profileSnapshot.title],
          ["用件", trip.purpose],
          ["出張期間", `${trip.startDate} - ${trip.endDate}`],
          ["出張区分", trip.category],
          ["適用旅費規程", rule ? `${rule.category} / ${rule.title} / 日当 ${yen(rule.perDiem)} / 宿泊 ${yen(rule.lodging)}` : "-"],
        ]}
      />
      <PrintTable
        title="交通費明細"
        headers={["日付", "種別", "区間", "便名", "金額"]}
        rows={trip.transports.map((item) => [item.date, item.type, `${item.from} - ${item.to}`, item.flightNo, yen(item.amount)])}
      />
      <p className="mt-2 text-right font-bold">交通費小計 {yen(totals.transport)}</p>
      <PrintTable
        title="宿泊費明細"
        headers={["開始日", "終了日", "宿泊先", "泊数", "金額"]}
        rows={trip.lodgings.map((item) => [item.startDate, item.endDate, item.place, `${lodgingNights(item)}泊`, yen(item.amount)])}
      />
      <p className="mt-2 text-right font-bold">宿泊費小計 {yen(totals.lodging)}</p>
      <PrintInfo rows={[["日当明細", `${yen(rule?.perDiem ?? 0)} × ${totals.tripDays}日`], ["日当小計", yen(totals.perDiem)], ["渡航支度金", yen(totals.preparation)], ["旅費総額", yen(totals.grand)]]} />
      <div className="mt-8 grid grid-cols-3 text-center text-sm">
        {["担当印", "上席印", "出納印"].map((label) => (
          <div key={label} className="border border-black p-3">{label}<br /><br /></div>
        ))}
      </div>
      <footer className="mt-8 text-sm">{trip.profileSnapshot.companyName}</footer>
    </PrintShell>
  );
}

function PrintInfo({ rows }: { rows: string[][] }) {
  return (
    <table className="mt-3 w-full border-collapse text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th className="w-36 border border-black bg-neutral-100 p-2 text-left">{label}</th>
            <td className="border border-black p-2">{value || "-"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PrintTable({ title, headers, rows }: { title: string; headers: string[]; rows: string[][] }) {
  return (
    <div className="mt-6">
      <h2 className="border-b border-black pb-1 font-bold">{title}</h2>
      <table className="mt-2 w-full border-collapse text-xs">
        <thead>
          <tr>{headers.map((header) => <th key={header} className="border border-black bg-neutral-100 p-2 text-left">{header}</th>)}</tr>
        </thead>
        <tbody>
          {(rows.length ? rows : [["-", "-", "-", "-", "-"]]).map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-black p-2">{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
