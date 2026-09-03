import assert from "node:assert/strict";
import { test } from "node:test";
import { detectFormat, parseNative } from "./parse.ts";
import { FEEDS, feedFor } from "./feeds.ts";

test("detects X12 310", () => {
  assert.equal(detectFormat(FEEDS.cma.body), "edi310");
});

test("detects MSC invoice JSON", () => {
  assert.equal(detectFormat(FEEDS.msc.body), "msc");
});

test("parses CMA 310 into a voidable invoice", () => {
  const result = parseNative(FEEDS.cma.body);
  assert.equal(result.format, "edi310");
  assert.equal(result.invoices.length, 1);
  const inv = result.invoices[0];
  assert.equal(inv.invoiceNumber, "CMA551902");
  assert.equal(inv.containerNumber, "CMAU5519028");
  assert.equal(inv.amountDue, 8100);
  assert.equal(inv.freeTimeEnd, null);
  assert.ok(result.warnings.some((w) => w.includes("free-time")));
});

test("parses CargoWise UniversalShipment", () => {
  const result = parseNative(FEEDS.cargowise.body);
  assert.equal(result.format, "cargowise");
  assert.ok(result.invoices.some((i) => i.invoiceNumber === "MSC-DND-99102"));
  assert.ok(result.invoices.some((i) => i.containerNumber === "HMMU4412098"));
  assert.ok(result.gates.some((g) => g.source === "tms" && g.eventType === "available"));
});

test("parses CODECO gate events", () => {
  const result = parseNative(FEEDS.maher.body);
  assert.equal(result.format, "codeco");
  assert.equal(result.invoices.length, 0);
  assert.ok(result.gates.length >= 3);
  assert.ok(result.gates.every((g) => g.containerNumber === "MAEU7733012"));
  assert.ok(result.gates.some((g) => g.eventType === "outgate"));
});

test("parses TOS JSON", () => {
  const result = parseNative(FEEDS.apm.body);
  assert.equal(result.format, "tos");
  assert.ok(result.gates.some((g) => g.containerNumber === "TCLU8811002" && g.eventType === "available"));
});

test("parses MSC invoice JSON", () => {
  const result = parseNative(FEEDS.msc.body);
  const inv = result.invoices[0];
  assert.equal(inv.billingParty, "MSC Mediterranean Shipping");
  assert.equal(inv.certFmcConsistent, false);
  assert.equal(inv.containerNumber, "TCLU8811002");
});

test("sandbox feeds round-trip through adapters", () => {
  for (const id of ["cargowise", "tango", "msc", "maersk", "cma", "apm", "maher", "pnct"]) {
    const pulled = feedFor(id);
    assert.ok(pulled.invoices.length + pulled.gates.length > 0, id);
  }
});
