-- Core schema for concert ticketing (MVP). camelCase naming in app; snake_case in SQL.

CREATE TABLE concerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  concert_date date NOT NULL,
  venue text NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'finished', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_concerts_status ON concerts (status);

CREATE TABLE concert_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL REFERENCES concerts (id) ON DELETE CASCADE,
  shopify_product_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (concert_id, shopify_product_id)
);

CREATE INDEX idx_concert_products_shopify_product_id ON concert_products (shopify_product_id);

CREATE TABLE processed_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id bigint NOT NULL UNIQUE,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL DEFAULT 'admin',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ticket_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concert_id uuid NOT NULL REFERENCES concerts (id),
  shopify_order_id bigint NOT NULL,
  shopify_line_item_id bigint NOT NULL,
  customer_email text NOT NULL,
  ticket_index int NOT NULL CHECK (ticket_index >= 1),
  qr_payload jsonb NOT NULL,
  qr_file_path text,
  status text NOT NULL CHECK (status IN ('issued', 'used', 'cancelled')) DEFAULT 'issued',
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shopify_order_id, shopify_line_item_id, ticket_index)
);

CREATE INDEX idx_ticket_assignments_concert ON ticket_assignments (concert_id);
CREATE INDEX idx_ticket_assignments_order ON ticket_assignments (shopify_order_id);

CREATE TABLE qr_pool (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  base_code text NOT NULL UNIQUE,
  is_allocated boolean NOT NULL DEFAULT false,
  allocated_at timestamptz
);

CREATE TABLE scan_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_assignment_id uuid REFERENCES ticket_assignments (id),
  concert_id uuid NOT NULL REFERENCES concerts (id),
  qr_payload jsonb NOT NULL,
  result text NOT NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  device_info text,
  staff_user_id uuid REFERENCES admin_users (id)
);

CREATE INDEX idx_scan_logs_concert ON scan_logs (concert_id);
CREATE INDEX idx_scan_logs_ticket ON scan_logs (ticket_assignment_id);
