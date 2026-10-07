// Run only by scripts/unhandled-request-guard.test.js: this test passes, and its run must still fail.
it("sends a request no handler answers", async () => {
  const response = await fetch(
    "https://api.example.test/scenarios/unmocked.json",
  );

  expect(response.status).toBe(500);
});
