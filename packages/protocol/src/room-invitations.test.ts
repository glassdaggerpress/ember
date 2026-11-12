import { describe, expect, it } from "vitest";
import { parseRoomInvitation } from "./index";

describe("Room invite input", () => {
  it("only accepts a full random token, never a URL or another JSON type", () => {
    const token = "a".repeat(43);
    expect(parseRoomInvitation({ token })).toBe(token);
    for (const value of [null, false, "token", {}, { token: [] }, { token: "../" + token }, { token: "https://other.test" }, { token: token + "a" }]) {
      expect(parseRoomInvitation(value)).toBeNull();
    }
  });
});
