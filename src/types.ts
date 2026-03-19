export interface Submission {
  id: number;
  sr_no: number;
  party_name: string;
  date: string;
  bill_no: string;
  barcode: string;
  s_m: string;
  amount: number;
  status: "PAID" | "UNPAID";
  created_at: string;
  updated_at: string;
}

export interface CreateSubmissionInput {
  party_name: string;
  date: string;
  bill_no: string;
  barcode: string;
  s_m: string;
  amount: number;
  status: "PAID" | "UNPAID";
}

export interface UpdateSubmissionInput {
  sr_no: number;
  party_name: string;
  date: string;
  bill_no: string;
  barcode: string;
  s_m: string;
  amount: number;
  status: "PAID" | "UNPAID";
}
