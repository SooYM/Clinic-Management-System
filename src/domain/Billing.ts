/**
 * OOP Domain Model: Billing & Point of Sale (POS)
 * Implements Open/Closed Principle via Strategy Pattern (Kumo Parity)
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
  private _payments: PaymentResult[] = [];

  constructor(id: string, patientId: string) {
    this._id = id;
    this._patientId = patientId;
  }

  public addItem(item: LineItem): void {
    if (this._isPaid) throw new Error("Cannot add items to paid invoice.");
    this._items.push(item);
  }

  public calculateSubtotal(): number {
    return this._items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
  }

  public calculateTotal(taxRate: number = 0.08): number {
    const subtotal = this.calculateSubtotal();
    return subtotal + (subtotal * taxRate);
  }

  public async pay(strategy: IPaymentStrategy): Promise<PaymentResult> {
    if (this._isPaid) throw new Error("Invoice is already paid.");
    const total = this.calculateTotal();
    const result = await strategy.processPayment(this._id, total);
    if (result.isSuccess) {
      this._payments.push(result);
      this._isPaid = true;
    }
    return result;
  }
}
