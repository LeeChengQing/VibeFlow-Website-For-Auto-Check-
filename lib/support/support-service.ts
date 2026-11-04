import { randomBytes, createHash, randomUUID } from 'node:crypto';
import type { Ticket, Message } from '@/lib/types';

export interface CreateTicketInput {
  email: unknown;
  reference?: unknown;
  subject: unknown;
  message: unknown;
  locale?: unknown;
}

function normalizeEmail(value: unknown): string {
  if (typeof value !== 'string') throw new Error('INVALID_EMAIL');
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new Error('INVALID_EMAIL');
  }
  return trimmed;
}

function validateText(value: unknown, min: number, max: number): string {
  if (typeof value !== 'string') throw new Error('INVALID_TEXT');
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new Error('INVALID_TEXT');
  return trimmed;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Universal query runner supporting both PGlite instances and Supabase client queries.
 */
async function queryDb<T>(db: any, sql: string, params: any[] = []): Promise<T[]> {
  if (typeof db.query === 'function') {
    const res = await db.query(sql, params);
    return res.rows as T[];
  }
  throw new Error('Unsupported database client for support ticketing');
}

export async function createSupportTicket(
  db: any,
  input: CreateTicketInput
): Promise<{ ticket: Ticket; token: string; url: string }> {
  const email = normalizeEmail(input.email);
  const subject = validateText(input.subject, 2, 120);
  const message = validateText(input.message, 5, 4000);
  const locale = input.locale === 'en' ? 'en' : 'zh';
  const orderRef = typeof input.reference === 'string' && input.reference.trim()
    ? input.reference.trim().toUpperCase()
    : null;

  // If order reference is given, verify against orders table
  if (orderRef) {
    if (typeof db.query === 'function') {
      const orders = await queryDb<{ buyer_email: string }>(
        db,
        `select buyer_email from public.orders where reference = $1 limit 1`,
        [orderRef]
      );
      if (orders.length > 0 && orders[0].buyer_email.toLowerCase() !== email) {
        throw new Error('ORDER_MISMATCH');
      }
    } else if (typeof db.from === 'function') {
      const { data } = await db
        .from('orders')
        .select('buyer_email')
        .eq('reference', orderRef)
        .maybeSingle();
      if (data && data.buyer_email?.toLowerCase() !== email) {
        throw new Error('ORDER_MISMATCH');
      }
    }
  }

  const rawToken = randomBytes(32).toString('hex');
  const tokenDigest = hashToken(rawToken);
  const ticketRef = `TK-${randomBytes(4).toString('hex').toUpperCase()}`;
  const ticketId = randomUUID();
  const messageId = randomUUID();
  const now = new Date().toISOString();

  if (typeof db.query === 'function') {
    await db.query(
      `insert into public.support_tickets (
        id, reference, email, order_reference, subject, status, access_token_hash, created_at, updated_at
      ) values ($1, $2, $3, $4, $5, 'open', $6, $7, $7)`,
      [ticketId, ticketRef, email, orderRef, subject, tokenDigest, now]
    );

    await db.query(
      `insert into public.support_messages (
        id, ticket_id, sender, message, created_at
      ) values ($1, $2, 'customer', $3, $4)`,
      [messageId, ticketId, message, now]
    );
  } else if (typeof db.from === 'function') {
    const { error: ticketErr } = await db.from('support_tickets').insert({
      id: ticketId,
      reference: ticketRef,
      email,
      order_reference: orderRef,
      subject,
      status: 'open',
      access_token_hash: tokenDigest,
      created_at: now,
      updated_at: now,
    });
    if (ticketErr) throw ticketErr;

    const { error: msgErr } = await db.from('support_messages').insert({
      id: messageId,
      ticket_id: ticketId,
      sender: 'customer',
      message,
      created_at: now,
    });
    if (msgErr) throw msgErr;
  }

  const ticket: Ticket = {
    id: ticketId,
    token: rawToken,
    reference: ticketRef,
    email,
    subject,
    locale,
    status: 'open',
    createdAt: now,
    messages: [
      {
        id: messageId,
        author: 'customer',
        body: message,
        createdAt: now,
      },
    ],
  };

  return { ticket, token: rawToken, url: `/support/${rawToken}` };
}

export async function getSupportTicketByToken(
  db: any,
  token: string
): Promise<Ticket | null> {
  const tokenDigest = hashToken(token);

  let ticketRow: any = null;
  let messageRows: any[] = [];

  if (typeof db.query === 'function') {
    const tickets = await queryDb<any>(
      db,
      `select id, reference, email, order_reference, subject, status, created_at
       from public.support_tickets
       where access_token_hash = $1 limit 1`,
      [tokenDigest]
    );
    if (tickets.length === 0) return null;
    ticketRow = tickets[0];

    messageRows = await queryDb<any>(
      db,
      `select id, sender, message, created_at
       from public.support_messages
       where ticket_id = $1
       order by created_at asc`,
      [ticketRow.id]
    );
  } else if (typeof db.from === 'function') {
    const { data: ticket, error } = await db
      .from('support_tickets')
      .select('id, reference, email, order_reference, subject, status, created_at')
      .eq('access_token_hash', tokenDigest)
      .maybeSingle();

    if (error || !ticket) return null;
    ticketRow = ticket;

    const { data: messages } = await db
      .from('support_messages')
      .select('id, sender, message, created_at')
      .eq('ticket_id', ticketRow.id)
      .order('created_at', { ascending: true });

    messageRows = messages || [];
  }

  if (!ticketRow) return null;

  return {
    id: ticketRow.id,
    token,
    reference: ticketRow.reference,
    email: ticketRow.email,
    subject: ticketRow.subject,
    locale: 'zh',
    status: ticketRow.status as 'open' | 'closed',
    createdAt: new Date(ticketRow.created_at).toISOString(),
    messages: messageRows.map(m => ({
      id: m.id,
      author: m.sender as 'customer' | 'admin',
      body: m.message,
      createdAt: new Date(m.created_at).toISOString(),
    })),
  };
}

export async function replySupportTicketByToken(
  db: any,
  token: string,
  messageText: unknown
): Promise<Ticket> {
  const body = validateText(messageText, 1, 4000);
  const ticket = await getSupportTicketByToken(db, token);
  if (!ticket) throw new Error('NOT_FOUND');
  if (ticket.status === 'closed') throw new Error('TICKET_CLOSED');

  const messageId = randomUUID();
  const now = new Date().toISOString();

  if (typeof db.query === 'function') {
    await db.query(
      `insert into public.support_messages (id, ticket_id, sender, message, created_at)
       values ($1, $2, 'customer', $3, $4)`,
      [messageId, ticket.id, body, now]
    );
    await db.query(
      `update public.support_tickets set updated_at = $1 where id = $2`,
      [now, ticket.id]
    );
  } else if (typeof db.from === 'function') {
    await db.from('support_messages').insert({
      id: messageId,
      ticket_id: ticket.id,
      sender: 'customer',
      message: body,
      created_at: now,
    });
    await db.from('support_tickets').update({ updated_at: now }).eq('id', ticket.id);
  }

  ticket.messages.push({
    id: messageId,
    author: 'customer',
    body,
    createdAt: now,
  });

  return ticket;
}

export async function adminReplySupportTicket(
  db: any,
  ticketId: string,
  messageText: unknown
): Promise<Ticket> {
  const body = validateText(messageText, 1, 4000);

  let ticketRow: any = null;
  if (typeof db.query === 'function') {
    const rows = await queryDb<any>(
      db,
      `select id, reference, email, subject, status, created_at from public.support_tickets where id = $1`,
      [ticketId]
    );
    if (rows.length === 0) throw new Error('NOT_FOUND');
    ticketRow = rows[0];
  } else if (typeof db.from === 'function') {
    const { data } = await db
      .from('support_tickets')
      .select('id, reference, email, subject, status, created_at')
      .eq('id', ticketId)
      .maybeSingle();
    if (!data) throw new Error('NOT_FOUND');
    ticketRow = data;
  }

  if (ticketRow.status === 'closed') throw new Error('TICKET_CLOSED');

  const messageId = randomUUID();
  const now = new Date().toISOString();

  if (typeof db.query === 'function') {
    await db.query(
      `insert into public.support_messages (id, ticket_id, sender, message, created_at)
       values ($1, $2, 'admin', $3, $4)`,
      [messageId, ticketId, body, now]
    );
    await db.query(
      `update public.support_tickets set updated_at = $1 where id = $2`,
      [now, ticketId]
    );
  } else if (typeof db.from === 'function') {
    await db.from('support_messages').insert({
      id: messageId,
      ticket_id: ticketId,
      sender: 'admin',
      message: body,
      created_at: now,
    });
    await db.from('support_tickets').update({ updated_at: now }).eq('id', ticketId);
  }

  // Fetch updated messages
  let messages: Message[] = [];
  if (typeof db.query === 'function') {
    const rows = await queryDb<any>(
      db,
      `select id, sender, message, created_at from public.support_messages where ticket_id = $1 order by created_at asc`,
      [ticketId]
    );
    messages = rows.map(m => ({
      id: m.id,
      author: m.sender as 'customer' | 'admin',
      body: m.message,
      createdAt: new Date(m.created_at).toISOString(),
    }));
  }

  return {
    id: ticketRow.id,
    token: '',
    reference: ticketRow.reference,
    email: ticketRow.email,
    subject: ticketRow.subject,
    locale: 'zh',
    status: ticketRow.status,
    createdAt: new Date(ticketRow.created_at).toISOString(),
    messages,
  };
}

export async function adminCloseSupportTicket(db: any, ticketId: string): Promise<Ticket> {
  let ticketRow: any = null;
  if (typeof db.query === 'function') {
    const rows = await queryDb<any>(
      db,
      `select id, reference, email, subject, status, created_at from public.support_tickets where id = $1`,
      [ticketId]
    );
    if (rows.length === 0) throw new Error('NOT_FOUND');
    ticketRow = rows[0];
  } else if (typeof db.from === 'function') {
    const { data } = await db
      .from('support_tickets')
      .select('id, reference, email, subject, status, created_at')
      .eq('id', ticketId)
      .maybeSingle();
    if (!data) throw new Error('NOT_FOUND');
    ticketRow = data;
  }

  if (ticketRow.status !== 'open') throw new Error('INVALID_STATE');

  const now = new Date().toISOString();
  if (typeof db.query === 'function') {
    await db.query(
      `update public.support_tickets set status = 'closed', updated_at = $1 where id = $2`,
      [now, ticketId]
    );
  } else if (typeof db.from === 'function') {
    await db.from('support_tickets').update({ status: 'closed', updated_at: now }).eq('id', ticketId);
  }

  return {
    id: ticketRow.id,
    token: '',
    reference: ticketRow.reference,
    email: ticketRow.email,
    subject: ticketRow.subject,
    locale: 'zh',
    status: 'closed',
    createdAt: new Date(ticketRow.created_at).toISOString(),
    messages: [],
  };
}

export async function adminReopenSupportTicket(db: any, ticketId: string): Promise<Ticket> {
  let ticketRow: any = null;
  if (typeof db.query === 'function') {
    const rows = await queryDb<any>(
      db,
      `select id, reference, email, subject, status, created_at from public.support_tickets where id = $1`,
      [ticketId]
    );
    if (rows.length === 0) throw new Error('NOT_FOUND');
    ticketRow = rows[0];
  } else if (typeof db.from === 'function') {
    const { data } = await db
      .from('support_tickets')
      .select('id, reference, email, subject, status, created_at')
      .eq('id', ticketId)
      .maybeSingle();
    if (!data) throw new Error('NOT_FOUND');
    ticketRow = data;
  }

  if (ticketRow.status !== 'closed') throw new Error('INVALID_STATE');

  const now = new Date().toISOString();
  if (typeof db.query === 'function') {
    await db.query(
      `update public.support_tickets set status = 'open', updated_at = $1 where id = $2`,
      [now, ticketId]
    );
  } else if (typeof db.from === 'function') {
    await db.from('support_tickets').update({ status: 'open', updated_at: now }).eq('id', ticketId);
  }

  return {
    id: ticketRow.id,
    token: '',
    reference: ticketRow.reference,
    email: ticketRow.email,
    subject: ticketRow.subject,
    locale: 'zh',
    status: 'open',
    createdAt: new Date(ticketRow.created_at).toISOString(),
    messages: [],
  };
}

export async function listSupportTickets(db: any): Promise<Ticket[]> {
  let tickets: any[] = [];
  if (typeof db.query === 'function') {
    tickets = await queryDb<any>(
      db,
      `select id, reference, email, subject, status, created_at from public.support_tickets order by created_at desc`
    );
    const messages = await queryDb<any>(
      db,
      `select id, ticket_id, sender, message, created_at from public.support_messages order by created_at asc`
    );

    const msgMap = new Map<string, Message[]>();
    for (const m of messages) {
      if (!msgMap.has(m.ticket_id)) msgMap.set(m.ticket_id, []);
      msgMap.get(m.ticket_id)!.push({
        id: m.id,
        author: m.sender as 'customer' | 'admin',
        body: m.message,
        createdAt: new Date(m.created_at).toISOString(),
      });
    }

    return tickets.map(t => ({
      id: t.id,
      token: '',
      reference: t.reference,
      email: t.email,
      subject: t.subject,
      locale: 'zh',
      status: t.status as 'open' | 'closed',
      createdAt: new Date(t.created_at).toISOString(),
      messages: msgMap.get(t.id) || [],
    }));
  }

  return [];
}
