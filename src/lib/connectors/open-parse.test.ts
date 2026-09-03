import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCwfHarbor, parseNdbcRealtime, parsePnctHours, parsePnctVessels } from "./open-parse.ts";

test("parses NDBC 44065 wave row, skipping MM", () => {
  const text = `#YY  MM DD hh mm WDIR WSPD GST  WVHT   DPD   APD MWD
2026 09 03 18 00  MM  0.0  1.0    MM    MM    MM  MM
2026 09 03 17 50 170  1.0  2.0   0.9     9   5.5 145
`;
  const parsed = parseNdbcRealtime(text);
  assert.ok(parsed);
  assert.ok(Math.abs(parsed.waveFt - 0.9 * 3.28084) < 0.01);
  assert.equal(parsed.wavePeriodSec, 9);
});

test("parses PNCT vessel board from data-ds", () => {
  const rows = [
    {
      VisitReference: "MSNU-636A",
      VesselName: "MSC NURIA",
      IbVoyNumber: "636A",
      EstimatedArrival: "2026-09-03T06:00:00",
      Arrival: "2026-09-03T06:30:00",
      EstimatedDeparture: "2026-09-03T19:00:00",
      Departure: null,
      CargoCutoff: "2026-09-02T23:00:00",
    },
    {
      VisitReference: "ASEA-7526",
      VesselName: "ATLANTIC SEA",
      IbVoyNumber: "7526",
      EstimatedArrival: "2026-09-03T06:00:00",
      Arrival: null,
      EstimatedDeparture: "2026-09-03T21:00:00",
      Departure: null,
      CargoCutoff: null,
    },
  ];
  const encoded = JSON.stringify(rows).replace(/"/g, "&" + "quot;");
  const html = `<div id="divVslSchedules" data-ds="${encoded}"></div>`;
  const calls = parsePnctVessels(html);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].vessel, "MSC NURIA");
  assert.equal(calls[0].status, "arrived");
  assert.equal(calls[0].port, "PNCT Newark");
  assert.equal(calls[0].voyage, "636A");
  assert.equal(calls[1].status, "due");
});

test("parses PNCT gate hours and closed notice", () => {
  const html = `<p>Monday, 9/07, PNCT will be CLOSED</p><p>Last truck allowed in queue is 4:45 PM.</p><p>Single Move Import Delivery 6:00 AM - 6:00 PM Monday - Friday</p><p>Double Moves 6:00 AM - 5:00 PM Monday - Friday</p>`;
  const hours = parsePnctHours(html);
  assert.ok(hours.notices[0]?.includes("CLOSED"));
  assert.equal(hours.lastTruck, "4:45 PM");
  assert.equal(hours.windows[0]?.label, "Single Move Import Delivery");
  assert.ok(hours.windows[0]?.hours.includes("6:00 AM"));
});

test("extracts ANZ338 TODAY from a CWF product", () => {
  const text = `ANZ338-032215-
New York Harbor-

.TODAY...SW winds 5 to 10 kt. Waves 1 to 2 ft.
.TONIGHT...W winds 5 to 10 kt. Waves 1 ft or less.
ANZ335-032215-
`;
  const parsed = parseCwfHarbor(text);
  assert.ok(parsed);
  assert.ok(parsed.includes("SW winds 5 to 10 kt"));
  assert.ok(parsed.includes("TONIGHT"));
  assert.ok(!parsed.includes("ANZ335"));
});
