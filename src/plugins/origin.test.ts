import { expect, it } from "vitest";
import { originOf } from "./types";

it("accepts https anywhere and http only on this computer or the local network", () => {
  expect(originOf("https://api.languagetool.org/v2/check")).toBe("https://api.languagetool.org");
  expect(originOf("http://localhost:8081/v2/check")).toBe("http://localhost:8081");
  expect(originOf("http://192.168.0.10:8010")).toBe("http://192.168.0.10:8010");
  expect(originOf("http://[::1]:8081/x")).toBe("http://[::1]:8081");
  expect(originOf("HTTPS://LT.Example.org:8443/")).toBe("https://lt.example.org:8443");
  expect(originOf("http://example.com")).toBeNull();
  expect(originOf("http://8.8.8.8:80")).toBeNull();
  expect(originOf("https://user@example.com")).toBeNull();
  expect(originOf("https://example.com:0")).toBeNull();
  expect(originOf("ftp://example.com")).toBeNull();
});
