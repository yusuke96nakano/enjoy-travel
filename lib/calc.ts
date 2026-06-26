import { LodgingItem, Totals, TransportItem, TravelRule, Trip } from "./types";

export const yen = (value: number) =>
  new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(
    Number.isFinite(value) ? value : 0,
  );

export const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const dateDiffDaysInclusive = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) return 0;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
};

export const lodgingNights = (item: LodgingItem) => {
  if (!item.startDate || !item.endDate) return 0;
  const start = new Date(`${item.startDate}T00:00:00`);
  const end = new Date(`${item.endDate}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
};

export const findRule = (rules: TravelRule[], date: string, category: string, title: string) => {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  return (
    rules
      .filter(
        (rule) =>
          rule.category === category &&
          rule.title === title &&
          rule.startDate <= targetDate &&
          rule.endDate >= targetDate,
      )
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null
  );
};

export const totalTransport = (items: TransportItem[]) =>
  items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

export const totalLodging = (items: LodgingItem[]) =>
  items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

export const calculateTotals = (trip: Pick<Trip, "startDate" | "endDate" | "transports" | "lodgings" | "ruleSnapshot">): Totals => {
  const tripDays = dateDiffDaysInclusive(trip.startDate, trip.endDate);
  const perDiem = (trip.ruleSnapshot?.perDiem ?? 0) * tripDays;
  const preparation = trip.ruleSnapshot?.preparation ?? 0;
  const transport = totalTransport(trip.transports);
  const lodging = totalLodging(trip.lodgings);

  return {
    tripDays,
    transport,
    lodging,
    perDiem,
    preparation,
    grand: transport + lodging + perDiem + preparation,
  };
};
