import assert from "node:assert/strict";
import { test } from "node:test";
import { isBlockedIp, parsePublicHttpsUrl, UnsafeUrlError } from "./ssrf.ts";

test("blocks loopback, RFC1918, link-local, ULA", () => {
  assert.equal(isBlockedIp("127.0.0.1"), true);
  assert.equal(isBlockedIp("10.0.0.4"), true);
  assert.equal(isBlockedIp("192.168.1.9"), true);
  assert.equal(isBlockedIp("172.16.0.1"), true);
  assert.equal(isBlockedIp("172.31.255.1"), true);
  assert.equal(isBlockedIp("169.254.169.254"), true);
  assert.equal(isBlockedIp("0.0.0.0"), true);
  assert.equal(isBlockedIp("::1"), true);
  assert.equal(isBlockedIp("::ffff:127.0.0.1"), true);
  assert.equal(isBlockedIp("fc00::1"), true);
  assert.equal(isBlockedIp("fd12:3456::1"), true);
  assert.equal(isBlockedIp("fe80::1"), true);
});

test("allows public unicast", () => {
  assert.equal(isBlockedIp("8.8.8.8"), false);
  assert.equal(isBlockedIp("1.1.1.1"), false);
  assert.equal(isBlockedIp("52.0.0.1"), false);
  assert.equal(isBlockedIp("2001:4860:4860::8888"), false);
});

test("rejects http, edi, localhost, credentials", () => {
  assert.throws(() => parsePublicHttpsUrl("http://api.msc.com/dnd"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpsUrl("edi://sandbox.cma-cgm.com/x12/310"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpsUrl("https://localhost/invoices"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpsUrl("https://127.0.0.1/invoices"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpsUrl("https://169.254.169.254/latest"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpsUrl("https://user:pass@api.example.com/v1"), UnsafeUrlError);
  assert.throws(() => parsePublicHttpsUrl("https://metadata.google.internal/"), UnsafeUrlError);
});

test("accepts public https", () => {
  const url = parsePublicHttpsUrl("https://api.example.com/v1/invoices");
  assert.equal(url.hostname, "api.example.com");
  assert.equal(url.protocol, "https:");
});
