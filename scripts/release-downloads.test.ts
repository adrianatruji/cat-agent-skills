import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateDownloads,
  formatReleaseBody,
  parseRetired,
  slugFromAssetName,
} from "../src/lib/release-downloads";

test("maps asset names to skill slugs", () => {
  assert.equal(slugFromAssetName("chart-builder.zip"), "chart-builder");
  assert.equal(slugFromAssetName("my-automation.json"), "my-automation");
  assert.equal(slugFromAssetName("idea-refiner.md"), "idea-refiner");
  assert.equal(slugFromAssetName("chart-builder.zip.1700000000.tmp"), null);
  assert.equal(slugFromAssetName("Bad--Name.zip"), null);
  assert.equal(slugFromAssetName("notes.txt"), null);
});

test("adds baseline, retired and live asset counts", () => {
  const totals = aggregateDownloads(
    { "chart-builder": 255, "linkedin-content-writer": 60 },
    { "chart-builder": 10 },
    [
      { name: "chart-builder.zip", download_count: 5 },
      { name: "linkedin-content-writer.md", download_count: 2 },
      { name: "new-skill.zip", download_count: 1 },
      { name: "chart-builder.zip.123.tmp", download_count: 99 },
    ],
  );
  assert.deepEqual(totals, {
    "chart-builder": 270,
    "linkedin-content-writer": 62,
    "new-skill": 1,
  });
  assert.deepEqual(Object.keys(totals), ["chart-builder", "linkedin-content-writer", "new-skill"]);
});

test("ignores zero, negative and non-numeric counts", () => {
  const totals = aggregateDownloads({ a: 0, b: -3, c: Number.NaN }, {}, [
    { name: "d.zip", download_count: 0 },
  ]);
  assert.deepEqual(totals, {});
});

test("retired tally round-trips through the release body", () => {
  const body = formatReleaseBody({ "chart-builder": 12, "a-skill": 3 });
  assert.deepEqual(parseRetired(body), { "a-skill": 3, "chart-builder": 12 });
});

test("missing or corrupt retired block reads as empty", () => {
  assert.deepEqual(parseRetired(null), {});
  assert.deepEqual(parseRetired("just some text"), {});
  assert.deepEqual(
    parseRetired("<!-- retired-downloads:start -->not json<!-- retired-downloads:end -->"),
    {},
  );
});
