// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallDialog } from "./PluginsSettings";
import type { DependencyPlan } from "./dependencies";
import type { InstallPreview, SignatureStatus } from "./types";

afterEach(cleanup);
const preview = (signature: SignatureStatus): InstallPreview => ({ manifest: { manifestVersion: 1, type: "plugin", id: "a.b", name: "Плагин", version: "1.0.0", permissions: ["ui.add"], dependencies: {}, contributes: {} }, signature, digest: "d", files: [], errors: [], warnings: [], installedVersion: null, needsConfirmation: signature.state !== "trusted" });
const empty: DependencyPlan = { ready: [], missing: [], disabled: [], update: [], downgrade: [], breaks: [] };

describe("install dialog", () => {
  it("installs a trusted package after one confirmation and hides empty dependency groups", () => {
    const install = vi.fn();
    render(<InstallDialog preview={preview({ state: "trusted", signer: "1VicTim1", publicKey: "k" })} plan={empty} busy={false} download={null} onInstall={install} onFetchDependencies={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.queryByText("Зависимости")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Установить" }));
    expect(install).toHaveBeenCalledOnce();
  });
  it("asks twice for a package without a trusted signature", () => {
    const install = vi.fn();
    render(<InstallDialog preview={preview({ state: "unsigned" })} plan={empty} busy={false} download={null} onInstall={install} onFetchDependencies={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Продолжить…" }));
    expect(install).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Подтверждение установки" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Да, установить без проверки" }));
    expect(install).toHaveBeenCalledOnce();
  });
  it("shows only the dependency groups with entries and offers catalog versions", () => {
    const fetch = vi.fn();
    const plan = { ...empty, missing: [{ id: "a.dep", requirement: "^1", available: "1.2.0", name: "Зависимость" }], ready: [{ id: "a.ok", requirement: "*", installed: "3.0.0" }] };
    render(<InstallDialog preview={preview({ state: "trusted", signer: "x", publicKey: "k" })} plan={plan} busy={false} download={null} onInstall={vi.fn()} onFetchDependencies={fetch} onCancel={vi.fn()} />);
    expect(screen.getByText("Не установлены")).toBeTruthy();
    expect(screen.getByText("Уже установлены")).toBeTruthy();
    expect(screen.queryByText("Нужно обновить")).toBeNull();
    expect(screen.queryByText("Перестанут работать")).toBeNull();
    expect(screen.getByText(/Одна зависимость найдена в каталоге/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Подтянуть зависимости" }));
    expect(fetch).toHaveBeenCalledOnce();
  });
});
