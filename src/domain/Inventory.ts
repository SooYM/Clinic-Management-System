/**
 * OOP Domain Model: Clinic Pharmacy & Consumables Inventory
 * Batch Tracking, FEFO Dispensing, and Branch Transfers
 */

export interface StockBatch {
  readonly batchNumber: string;
  readonly expiryDate: Date;
  quantityAvailable: number;
}

export class InventoryItem {
  private readonly _itemSku: string;
  private readonly _itemName: string;
  private readonly _branchId: string;
  private readonly _minimumParLevel: number;
  private _batches: StockBatch[] = [];

  constructor(itemSku: string, itemName: string, branchId: string, minimumParLevel: number = 10) {
    if (!itemSku) throw new Error("SKU is required.");
    if (!itemName) throw new Error("Item name is required.");
    this._itemSku = itemSku;
    this._itemName = itemName;
    this._branchId = branchId;
    this._minimumParLevel = minimumParLevel;
  }

  public get itemSku(): string { return this._itemSku; }
  public get itemName(): string { return this._itemName; }
  public get branchId(): string { return this._branchId; }
  public get totalStockOnHand(): number {
    return this._batches.reduce((sum, b) => sum + b.quantityAvailable, 0);
  }
  public get isBelowParLevel(): boolean {
    return this.totalStockOnHand < this._minimumParLevel;
  }

  public receiveBatch(batchNumber: string, expiryDate: Date, quantity: number): void {
    if (quantity <= 0) throw new Error("Received quantity must be positive.");
    if (expiryDate <= new Date()) throw new Error("Cannot receive expired inventory batch.");

    this._batches.push({
      batchNumber,
      expiryDate,
      quantityAvailable: quantity,
    });

    // Sort batches by earliest expiry date (FEFO - First Expiry First Out)
    this._batches.sort((a, b) => a.expiryDate.getTime() - b.expiryDate.getTime());
  }

  /**
   * Enforces FEFO (First-Expiry-First-Out) Dispensation Invariant
   */
  public dispenseStock(requestedQty: number): Array<{ batchNumber: string; quantityDeducted: number }> {
    if (requestedQty <= 0) throw new Error("Dispense quantity must be positive.");
    if (this.totalStockOnHand < requestedQty) {
      throw new Error(`Insufficient stock for ${this._itemName}. Requested: ${requestedQty}, Available: ${this.totalStockOnHand}`);
    }

    const deductions: Array<{ batchNumber: string; quantityDeducted: number }> = [];
    let remainingToDeduct = requestedQty;

    for (const batch of this._batches) {
      if (remainingToDeduct === 0) break;
      if (batch.quantityAvailable <= 0) continue;

      const deductAmount = Math.min(batch.quantityAvailable, remainingToDeduct);
      batch.quantityAvailable -= deductAmount;
      remainingToDeduct -= deductAmount;

      deductions.push({
        batchNumber: batch.batchNumber,
        quantityDeducted: deductAmount,
      });
    }

    // Clean up empty batches
    this._batches = this._batches.filter(b => b.quantityAvailable > 0);
    return deductions;
  }
}
