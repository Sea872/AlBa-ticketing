import { getPool } from "../db/client/pool.js";
import { listRecentProcessedOrdersWithStats } from "../db/repositories/processedOrdersRepository.js";

/**
 * Overview metrics for admin hub (dashboard).
 */
export async function getAdminDashboardSummary() {
  const pool = getPool();

  const upcoming = await pool.query(
    `SELECT c.id, c.name, c.concert_date, c.venue, c.status,
            (SELECT COUNT(*)::int FROM ticket_assignments ta WHERE ta.concert_id = c.id) AS tickets_sold,
            (SELECT COUNT(*)::int FROM ticket_assignments ta
             WHERE ta.concert_id = c.id AND ta.email_last_error IS NOT NULL) AS email_failure_count
     FROM concerts c
     WHERE c.concert_date >= CURRENT_DATE
       AND c.status = 'active'
     ORDER BY c.concert_date ASC, c.name ASC
     LIMIT 15`
  );

  const totals = await pool.query(
    `SELECT
       (SELECT COUNT(*)::int FROM ticket_assignments WHERE status = 'issued' OR status = 'used') AS total_tickets_issued,
       (SELECT COUNT(*)::int FROM ticket_assignments WHERE email_last_error IS NOT NULL) AS open_email_failures,
       (SELECT COUNT(*)::int FROM concerts WHERE status = 'active' AND concert_date >= CURRENT_DATE) AS upcoming_concert_count`
  );

  const t = totals.rows[0] ?? {};
  return {
    totals: {
      ticketsIssued: Number(t.total_tickets_issued) || 0,
      openEmailFailures: Number(t.open_email_failures) || 0,
      upcomingActiveConcerts: Number(t.upcoming_concert_count) || 0,
    },
    upcomingConcerts: upcoming.rows.map((row) => {
      const d = row.concert_date;
      const concertDate =
        d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
      return {
        id: row.id,
        name: row.name,
        concertDate,
        venue: row.venue,
        status: row.status,
        ticketsSold: Number(row.tickets_sold) || 0,
        emailFailureCount: Number(row.email_failure_count) || 0,
      };
    }),
  };
}

export async function getRecentProcessedOrders(limit) {
  const rows = await listRecentProcessedOrdersWithStats(limit);
  return rows.map((r) => ({
    shopifyOrderId: String(r.shopify_order_id),
    processedAt:
      r.processed_at instanceof Date ? r.processed_at.toISOString() : String(r.processed_at),
    ticketCount: Number(r.ticket_count) || 0,
    emailsSentCount: Number(r.emails_sent_count) || 0,
    ticketsWithEmailErrors: Number(r.tickets_with_email_errors) || 0,
    concertNameHint: r.concert_name_hint ?? "—",
  }));
}
