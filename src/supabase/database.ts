export type CwGatewayRow = {
  id: number;
  created_at: string;
  updated_at: string | null;
  gateway_name: string;
  is_online: boolean;
  gateway_id: string;
  is_public: boolean;
};

export type CwGatewayInsert = Omit<CwGatewayRow, "id" | "created_at">;

export type Database = {
  public: {
    Tables: {
      cw_gateways: {
        Row: CwGatewayRow;
        Insert: CwGatewayInsert;
        Update: Partial<CwGatewayInsert>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
