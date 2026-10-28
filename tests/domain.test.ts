import assert from "node:assert/strict";
import test from "node:test";
import { InventoryItem } from "../src/domain/Inventory";
import { TreatmentPackage } from "../src/domain/TreatmentPackage";
import { Invoice, type IPaymentStrategy, type PaymentResult } from "../src/domain/Billing";
import { Patient } from "../src/domain/Patient";
import { QueueTicket, QueueStatus, type ConsultationRoom } from "../src/domain/QueueManagement";

test("FEFO skips expired batches and insufficient usable stock leaves inventory unchanged", t => {
  const now = Date.now();
  const item = new InventoryItem("SKU", "Drug", "BRANCH");
  item.receiveBatch("LATER", new Date(now + 30000), 5);
  item.receiveBatch("EXPIRED", new Date(now + 10000), 10);
  item.receiveBatch("FIRST", new Date(now + 20000), 3);
  t.mock.method(Date, "now", () => now + 15000);
  assert.throws(() => item.dispenseStock(9), /Insufficient stock/);
  assert.equal(item.totalStockOnHand, 18);
  assert.deepEqual(item.dispenseStock(5), [
    { batchNumber: "FIRST", quantityDeducted: 3 },
    { batchNumber: "LATER", quantityDeducted: 2 },
  ]);
  assert.equal(item.totalStockOnHand, 13);
});

test("inventory rejects nonfinite quantities and invalid expiry without accepting stock", () => {
  const item = new InventoryItem("SKU", "Drug", "BRANCH");
  for (const quantity of [NaN, Infinity, -Infinity, 0, -1]) {
    assert.throws(() => item.receiveBatch("B", new Date(Date.now() + 60000), quantity));
    assert.throws(() => item.dispenseStock(quantity));
  }
  assert.throws(() => item.receiveBatch("B", new Date(NaN), 1));
  const expiry = new Date(Date.now() + 60000);
  item.receiveBatch("B", expiry, 1);
  expiry.setTime(0);
  assert.equal(item.dispenseStock(1)[0].batchNumber, "B");
});

test("package extension updates expiry and preserves redemption limit", () => {
  const expiry = new Date(Date.now() + 60000);
  const pkg = new TreatmentPackage("PKG", "P", "Treatment", 1, new Date(0), expiry, 10);
  expiry.setTime(0);
  const extended = new Date(Date.now() + 120000);
  pkg.extendExpiry(extended, "MANAGER");
  assert.equal(pkg.expiryDate.getTime(), extended.getTime());
  extended.setTime(0);
  assert.equal(pkg.isExpired, false);
  assert.throws(() => pkg.extendExpiry(new Date(NaN), "MANAGER"));
  assert.throws(() => pkg.extendExpiry(new Date(Date.now() + 180000), ""));
  pkg.redeemSession("DOCTOR", "BRANCH", "Notes");
  assert.equal(pkg.sessionsRemaining, 0);
  assert.throws(() => pkg.redeemSession("DOCTOR", "BRANCH", "Notes"), /consumed/);
});

test("package rejects invalid dates, fractional sessions, and nonfinite prices", () => {
  const expiry = new Date(Date.now() + 60000);
  for (const sessions of [NaN, Infinity, 0, 1.5]) {
    assert.throws(() => new TreatmentPackage("PKG", "P", "Treatment", sessions, new Date(0), expiry, 10));
  }
  assert.throws(() => new TreatmentPackage("PKG", "P", "Treatment", 1, new Date(NaN), expiry, 10));
  assert.throws(() => new TreatmentPackage("PKG", "P", "Treatment", 1, new Date(0), expiry, NaN));
});

const lineItem = { id: "ITEM", description: "Consultation", quantity: 1, unitPrice: 100, category: "CONSULTATION" as const };

test("invoice rejects invalid item amounts, taxes, and overflowing totals", () => {
  const invoice = new Invoice("INV", "P");
  for (const quantity of [NaN, Infinity, 0, -1]) assert.throws(() => invoice.addItem({ ...lineItem, quantity }));
  for (const unitPrice of [NaN, Infinity, -1]) assert.throws(() => invoice.addItem({ ...lineItem, unitPrice }));
  for (const tax of [NaN, Infinity, -1]) assert.throws(() => invoice.calculateTotal(tax));
  const mutableItem = { ...lineItem };
  invoice.addItem(mutableItem);
  mutableItem.unitPrice = -100;
  assert.equal(invoice.calculateTotal(), 108);
  invoice.addItem({ ...lineItem, unitPrice: Number.MAX_VALUE, quantity: 2 });
  assert.throws(() => invoice.calculateTotal(), /finite/);
});

test("invoice blocks concurrent payments and edits during settlement", async () => {
  const invoice = new Invoice("INV", "P");
  invoice.addItem(lineItem);
  let settle!: (value: PaymentResult) => void;
  let calls = 0;
  const strategy: IPaymentStrategy = {
    methodIdentifier: "TEST",
    processPayment: () => { calls++; return new Promise(resolve => { settle = resolve; }); },
  };
  const pending = invoice.pay(strategy);
  await assert.rejects(invoice.pay(strategy), /progress/);
  assert.throws(() => invoice.addItem(lineItem), /progress/);
  assert.equal(calls, 1);
  settle({ transactionId: "TX", amount: 108, method: "TEST", isSuccess: true, settledAt: new Date() });
  await pending;
  await assert.rejects(invoice.pay(strategy), /already paid/);
});

test("failed, rejected, and mismatched payments permit a subsequent valid payment", async () => {
  const invoice = new Invoice("INV", "P");
  invoice.addItem(lineItem);
  const result: PaymentResult = { transactionId: "TX", amount: 108, method: "TEST", isSuccess: true, settledAt: new Date() };
  const strategy: IPaymentStrategy = { methodIdentifier: "TEST", processPayment: async () => { throw new Error("Unavailable"); } };
  await assert.rejects(invoice.pay(strategy), /Unavailable/);
  strategy.processPayment = async () => ({ ...result, isSuccess: false });
  assert.equal((await invoice.pay(strategy)).isSuccess, false);
  strategy.processPayment = async () => ({ ...result, amount: 0 });
  await assert.rejects(invoice.pay(strategy), /amount/);
  strategy.processPayment = async () => result;
  assert.equal((await invoice.pay(strategy)).isSuccess, true);
});

test("patient age follows calendar birthdays and rejects invalid dates", t => {
  t.mock.timers.enable({ apis: ["Date"], now: new Date(2026, 9, 7, 12).getTime() });
  assert.equal(new Patient("P", "IC", "Name", new Date(2000, 9, 7)).age, 26);
  assert.equal(new Patient("P", "IC", "Name", new Date(2000, 9, 8)).age, 25);
  assert.equal(new Patient("P", "IC", "Name", new Date(2000, 9, 6)).age, 26);
  assert.throws(() => new Patient("P", "IC", "Name", new Date(NaN)));
  assert.throws(() => new Patient("P", "IC", "Name", new Date(2027, 0, 1)));
  const birth = new Date(2000, 9, 7);
  const patient = new Patient("P", "IC", "Name", birth);
  birth.setFullYear(2020);
  assert.equal(patient.age, 26);
});

const room = (id: string): ConsultationRoom => ({ roomId: id, roomNumber: id, attendingPractitionerId: `DR-${id}`, isOccupied: false });

test("queue cannot share occupied rooms and reallocating frees previous room", () => {
  const ticket = new QueueTicket("T", "Q1", "P", "DR");
  const other = new QueueTicket("OTHER", "Q2", "P2", "DR");
  const first = room("1");
  const second = room("2");
  ticket.callToRoom(first);
  assert.throws(() => other.callToRoom(first), /occupied/);
  assert.equal(other.status, QueueStatus.REGISTERED);
  ticket.callToRoom(second);
  assert.equal(first.isOccupied, false);
  assert.equal(second.isOccupied, true);
  assert.equal(ticket.assignedPractitionerId, "DR-2");
  other.callToRoom(first);
  ticket.startConsultation();
  assert.throws(() => ticket.callToRoom(first), /waiting/);
});

test("queue enforces consultation progression and releases rooms on routing or completion", () => {
  const ticket = new QueueTicket("T", "Q1", "P", "DR");
  assert.throws(() => ticket.routeToDispensaryAndPayment(), /Consultation/);
  assert.throws(() => ticket.markCompleted(), /consultation/);
  const allocated = room("1");
  ticket.callToRoom(allocated);
  ticket.startConsultation();
  ticket.routeToDispensaryAndPayment();
  assert.equal(ticket.status, QueueStatus.DISPENSARY_WAITING);
  assert.equal(allocated.isOccupied, false);
  assert.equal(ticket.allocatedRoom, undefined);
  assert.throws(() => ticket.callToRoom(allocated));
  ticket.markCompleted();
  assert.throws(() => ticket.routeToDispensaryAndPayment());
  const direct = new QueueTicket("T2", "Q2", "P2", "DR");
  direct.callToRoom(allocated);
  direct.startConsultation();
  direct.markCompleted();
  assert.equal(allocated.isOccupied, false);
  assert.equal(direct.allocatedRoom, undefined);
});
