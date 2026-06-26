export type TripCategory = "国内近距離出張" | "国内遠距離出張" | "海外出張";

export type Profile = {
  companyName: string;
  name: string;
  department: string;
  title: string;
};

export type TravelRule = {
  id: string;
  startDate: string;
  endDate: string;
  category: TripCategory;
  title: string;
  perDiem: number;
  lodging: number;
  preparation: number;
  flightClass: string;
  railClass: string;
  shipClass: string;
  note: string;
};

export type AirFare = {
  id: string;
  airline: "JAL" | "ANA";
  from: string;
  to: string;
  fareType: "フレックス";
  amount: number;
  note: string;
};

export type TransportItem = {
  id: string;
  date: string;
  type: "飛行機" | "新幹線" | "電車" | "タクシー" | "その他";
  airline: "JAL" | "ANA" | "その他" | "";
  flightNo: string;
  from: string;
  to: string;
  fareType: "フレックス" | "その他";
  amount: number;
  note: string;
};

export type LodgingItem = {
  id: string;
  startDate: string;
  endDate: string;
  place: string;
  amount: number;
  note: string;
};

export type Trip = {
  id: string;
  createdAt: string;
  category: TripCategory;
  startDate: string;
  endDate: string;
  destination: string;
  purpose: string;
  note: string;
  reportMemo: string;
  reportText: string;
  profileSnapshot: Profile;
  ruleSnapshot: TravelRule | null;
  transports: TransportItem[];
  lodgings: LodgingItem[];
};

export type Totals = {
  tripDays: number;
  transport: number;
  lodging: number;
  perDiem: number;
  preparation: number;
  grand: number;
};
