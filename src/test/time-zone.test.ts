it("runs in UTC, so a date formatter that forgets Malaysia's offset fails its tests", () => {
  expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("UTC");
});
