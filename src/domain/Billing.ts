/**
 * OOP Domain Model: Billing & Point of Sale (POS)
 * Implements Open/Closed Principle via Strategy Pattern
 */

export interface LineItem {
  readonly id: string;
  readonly description: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly category: "CONSULTATION" | "MEDICATION" | "PROCEDURE" | "PACKAGE";
}

export interface PaymentResult {
  readonly transactionId: string;
  readonly amount: number;
  readonly method: string;
  readonly isSuccess: boolean;
  readonly settledAt: Date;
}

export interface IPaymentStrategy {
  readonly methodIdentifier: string;
  processPayment(invoiceId: string, amount: number): Promise<PaymentResult>;
}

export class CreditCardPaymentStrategy implements IPaymentStrategy {
  public readonly methodIdentifier = "CREDIT_CARD";
  async processPayment(invoiceId: string, amount: number): Promise<PaymentResult> {
    return {
      transactionId: `CC-TX-${Date.now()}`,
      amount,
      method: this.methodIdentifier,
      isSuccess: true,
      settledAt: new Date()
    };
  }
}

export class TreatmentPackageRedemptionStrategy implements IPaymentStrategy {
  public readonly methodIdentifier = "PREPAID_PACKAGE";
  constructor(private readonly packageId: string) {}

  async processPayment(invoiceId: string, amount: number): Promise<PaymentResult> {
    return {
      transactionId: `PKG-REDEMPTION-${this.packageId}`,
      amount,
      method: this.methodIdentifier,
      isSuccess: true,
      settledAt: new Date()
    };
  }
}

export class Invoice {
  private readonly _id: string;
  private readonly _patientId: string;
  private _items: LineItem[] = [];
  private _isPaid: boolean = false;
  private _paymentInProgress: boolean = false;
  private _payments: PaymentResult[] = [];

  constructor(id: string, patientId: string) {
    this._id = id;
    this._patientId = patientId;
  }

  public addItem(item: LineItem): void {
    if (this._isPaid || this._paymentInProgress) throw new Error("Cannot add items to paid invoice or while payment is in progress.");
    if (!Number.isFinite(item.quantity) || item.quantity <= 0 || !Number.isFinite(item.unitPrice) || item.unitPrice < 0) {
      throw new Error("Item quantity must be positive and unit price must be nonnegative finite numbers.");
    }
    this._items.push({ ...item });
  }

  public calculateSubtotal(): number {
    return this._items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  }

  public calculateTotal(taxRate: number = 0.08): number {
    if (!Number.isFinite(taxRate) || taxRate < 0) throw new Error("Tax rate must be a nonnegative finite number.");
    const subtotal = this.calculateSubtotal();
    const total = subtotal + (subtotal * taxRate);
    if (!Number.isFinite(total)) throw new Error("Invoice total must be finite.");
    return total;
  }

  public async pay(strategy: IPaymentStrategy): Promise<PaymentResult> {
    if (this._isPaid || this._paymentInProgress) throw new Error("Invoice is already paid or payment is in progress.");
    const total = this.calculateTotal();
    this._paymentInProgress = true;
    try {
      const result = await strategy.processPayment(this._id, total);
      if (result.isSuccess) {
        if (result.amount !== total) throw new Error("Payment amount must match invoice total.");
        this._payments.push(result);
        this._isPaid = true;
      }
      return result;
    } finally {
      this._paymentInProgress = false;
    }
  }
}
