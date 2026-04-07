import { getPool } from "../client/pool.js";

/**
 * @param {{
 *   ticketAssignmentId: string | null,
 *   concertId: string,
 *   qrPayload: object,
 *   result: string,
 *   deviceInfo: string | null,
 *   staffUserId: string | null,
 * }} row
 * @param {import('pg').PoolClient | null} [client]
 */
export async function insertScanLog(row, client = null) {
  const executor = client ?? getPool();
  await executor.query(
    `INSERT INTO scan_logs (
       ticket_assignment_id,
       concert_id,
       qr_payload,
       result,
       device_info,
       staff_user_id
     )
     VALUES ($1::uuid, $2::uuid, $3::jsonb, $4, $5, $6::uuid)`,
    [
      row.ticketAssignmentId,
      row.concertId,
      JSON.stringify(row.qrPayload),
      row.result,
      row.deviceInfo,
      row.staffUserId,
    ]
  );
}
