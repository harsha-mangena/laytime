import assert from "node:assert/strict";
import { test } from "node:test";
import { CONNECTORS } from "./catalog.ts";
import { isLiveAttempt } from "./live-mode.ts";

const msc = CONNECTORS.find((c) => c.id === "msc")!;
const cma = CONNECTORS.find((c) => c.id === "cma")!;

test("catalog sandbox URL + token is not live", () => {
  assert.equal(isLiveAttempt(msc, msc.endpoint, msc.sandboxKey), false);
});

test("own key against catalog host is live", () => {
  assert.equal(isLiveAttempt(msc, msc.endpoint, "real-msc-key-from-portal"), true);
});

test("own https host is live", () => {
  assert.equal(isLiveAttempt(msc, "https://api.msc.com/dnd/invoices", "k"), true);
});

test("edi mailbox stays sandbox", () => {
  assert.equal(isLiveAttempt(cma, cma.endpoint, "different-token"), false);
});

test("https upgrade of an edi connector is live", () => {
  assert.equal(isLiveAttempt(cma, "https://edi.example.com/x12/310", "mailbox-token"), true);
});
