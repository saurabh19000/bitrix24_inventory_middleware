import { BitrixClient } from './BitrixClient';
import { logger } from '../../utils/logger';

export interface BitrixInvoiceField {
  id: string;
  name: string;
  type: string;
  isRequired: boolean;
}

export interface BitrixInvoiceStatus {
  id: string;
  name: string;
}

export interface InvoiceRecordData {
  [key: string]: any;
}

export const INVOICE_STATUSES: BitrixInvoiceStatus[] = [
  { id: 'N', name: 'New' },
  { id: 'S', name: 'Sent to customer' },
  { id: 'P', name: 'Paid' },
  { id: 'D', name: 'Unpaid' },
];

const INVOICE_FIELDS: BitrixInvoiceField[] = [
  { id: 'ACCOUNT_NUMBER', name: 'Invoice number (unique reference)', type: 'string', isRequired: true },
  { id: 'ORDER_TOPIC', name: 'Subject / Order topic', type: 'string', isRequired: false },
  { id: 'CLIENT', name: 'Customer / Client', type: 'string', isRequired: false },
  { id: 'PRICE', name: 'Amount', type: 'double', isRequired: false },
  { id: 'CURRENCY', name: 'Currency', type: 'string', isRequired: false },
  { id: 'STATUS_ID', name: 'Status', type: 'string', isRequired: false },
  { id: 'DATE_BILL', name: 'Invoice date', type: 'date', isRequired: false },
  { id: 'DATE_PAY_BEFORE', name: 'Due date', type: 'date', isRequired: false },
  { id: 'PAYED', name: 'Paid flag (Y/N)', type: 'char', isRequired: false },
  { id: 'COMMENT', name: 'Comment / Notes', type: 'string', isRequired: false },
];

const INVOICE_SELECT = [
  'ID',
  'ACCOUNT_NUMBER',
  'ORDER_TOPIC',
  'STATUS_ID',
  'PRICE',
  'CURRENCY',
  'DATE_BILL',
  'DATE_PAY_BEFORE',
  'PAYED',
];

export class BitrixInvoiceService {
  private client: BitrixClient;

  constructor(client: BitrixClient) {
    this.client = client;
  }

  static getFields(): BitrixInvoiceField[] {
    return INVOICE_FIELDS;
  }

  static getStatusOptions(): BitrixInvoiceStatus[] {
    return INVOICE_STATUSES;
  }

  async findInvoiceByNumber(accountNumber: string): Promise<any | null> {
    try {
      const normalized = String(accountNumber || '').trim();
      if (!normalized) return null;

      const responses = await this.client.callMethod('crm.invoice.list', {
        select: INVOICE_SELECT,
        filter: { ACCOUNT_NUMBER: normalized },
      });

      // crm.invoice.list returns the array directly in result on REST 3.0
      const list = Array.isArray(responses)
        ? responses
        : ((responses && responses.invoices) || (responses && responses.result) || []);

      return list[0] || null;
    } catch (error) {
      logger.warn({ err: error }, `Failed to search invoice by account number ${accountNumber}`);
      return null;
    }
  }

  async createInvoice(fields: any): Promise<number> {
    const result = await this.client.callMethod('crm.invoice.add', { fields });
    const invoice = result && (result.invoice || result.result || result);
    const id = typeof invoice === 'number' ? invoice : invoice?.ID || invoice?.id || result?.result?.ID;

    if (!id) {
      throw new Error('Bitrix did not return an invoice ID after creation');
    }
    return Number(id);
  }

  async updateInvoice(id: number, fields: any): Promise<boolean> {
    try {
      await this.client.callMethod('crm.invoice.update', { id, fields });
      return true;
    } catch (error) {
      logger.error({ err: error }, `Failed to update invoice ${id}`);
      return false;
    }
  }

  // Coerces raw Excel values into Bitrix invoice field formats
  static normalizeFields(raw: InvoiceRecordData): {
    fields: any;
    unsupported: string[];
  } {
    const fields: any = {};
    const unsupported: string[] = [];

    const str = (v: any) => (v !== undefined && v !== null && String(v).trim() !== '' ? String(v).trim() : undefined);
    const date = (v: any) => {
      const s = str(v);
      if (!s) return undefined;
      const d = new Date(s);
      if (isNaN(d.getTime())) {
        // Plain YYYY-MM-DD
        return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined;
      }
      return d.toISOString().slice(0, 10);
    };

    if (raw.ACCOUNT_NUMBER) fields.ACCOUNT_NUMBER = str(raw.ACCOUNT_NUMBER);
    if (raw.ORDER_TOPIC) fields.ORDER_TOPIC = str(raw.ORDER_TOPIC);
    if (raw.CLIENT) fields.CLIENT = str(raw.CLIENT);
    if (raw.STATUS_ID) {
      const st = str(raw.STATUS_ID);
      if (st) fields.STATUS_ID = st.toUpperCase();
    }
    if (raw.PRICE !== undefined && raw.PRICE !== null && raw.PRICE !== '') {
      const price = Number(raw.PRICE);
      if (!isNaN(price)) fields.PRICE = price;
      else unsupported.push('Amount is not numeric');
    }
    if (raw.CURRENCY) {
      const cur = str(raw.CURRENCY);
      if (cur) {
        const currency = cur.toUpperCase();
        if (/^[A-Z]{3}$/.test(currency)) fields.CURRENCY = currency;
        else unsupported.push(`Invalid currency: ${raw.CURRENCY}`);
      } else {
        unsupported.push(`Invalid currency: ${raw.CURRENCY}`);
      }
    }
    if (raw.DATE_BILL) {
      const d = date(raw.DATE_BILL);
      d ? (fields.DATE_BILL = d) : unsupported.push('Invoice date is not a valid date');
    }
    if (raw.DATE_PAY_BEFORE) {
      const d = date(raw.DATE_PAY_BEFORE);
      d ? (fields.DATE_PAY_BEFORE = d) : unsupported.push('Due date is not a valid date');
    }
    if (raw.COMMENT) fields.COMMENT = str(raw.COMMENT);

    // Derive paid flag from status when not explicitly provided
    if (fields.STATUS_ID === 'P') fields.PAYED = 'Y';
    if (fields.STATUS_ID && fields.STATUS_ID !== 'P') fields.PAYED = 'N';

    return { fields, unsupported };
  }
}