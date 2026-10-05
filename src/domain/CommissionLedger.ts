/**
 * OOP Domain Model: Practitioner Commission & Performance Ledger
 * Core Kumo Clinic capability: Distributes service, package, and retail product sales commissions
 */

export type CommissionTargetType = "CONSULTATION" | "TREATMENT_SESSION" | "PACKAGE_SALE" | "RETAIL_PRODUCT";

export interface CommissionRule {
  readonly targetType: CommissionTargetType;
  readonly percentageRate: number; // e.g. 0.15 for 15%
  readonly fixedBonusAmount?: number;
}

export interface CommissionEntry {
  readonly transactionId: string;
  readonly practitionerId: string;
  readonly targetType: CommissionTargetType;
  readonly grossRevenue: number;
  readonly computedCommission: number;
  readonly timestamp: Date;
}

export class CommissionCalculator {
  private readonly _rules: Map<CommissionTargetType, CommissionRule> = new Map();

  constructor(rules: CommissionRule[]) {
    rules.forEach(rule => this._rules.set(rule.targetType, rule));
  }

  public calculate(
    practitionerId: string,
    transactionId: string,
    targetType: CommissionTargetType,
    grossRevenue: number
  ): CommissionEntry {
    const rule = this._rules.get(targetType);
    if (!rule) {
      throw new Error(`No commission rule configured for target type: ${targetType}`);
    }

    const percentageShare = grossRevenue * rule.percentageRate;
    const bonus = rule.fixedBonusAmount ?? 0;
    const totalCommission = Math.round((percentageShare + bonus) * 100) / 100;

    return {
      transactionId,
      practitionerId,
      targetType,
      grossRevenue,
      computedCommission: totalCommission,
      timestamp: new Date()
    };
  }
}
