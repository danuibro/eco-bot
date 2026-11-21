export type WasteCategory = 'COMPOST' | 'RECYCLING' | 'TRASH' | 'CHECK FIRST';

export interface IdentifiedWasteItem {
  name: string;
  classification: WasteCategory;
  schoolBin: string;
  explanation: string;
}

export interface WasteAnalysisResponse {
  isUnclear: boolean;
  unclearMessage: string;
  items: IdentifiedWasteItem[];
  diversionSummary: string;
  environmentalTip: string;
}
