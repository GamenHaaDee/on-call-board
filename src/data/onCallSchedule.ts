// De daadwerkelijke planning komt nu uit de database via de backend-API
// (zie src/data/api.ts). Dit bestand bevat alleen nog het gedeelde type.
export interface OnCallEntry {
  id: string;
  name: string;
  phone: string;
  startDate: string;
  endDate: string;
}
