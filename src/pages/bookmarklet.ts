import { View, Div, P, Button, signal, computed, effect } from "@matthewp/zebra";
import type { BookmarkletData } from "../loaders/bookmarklet.ts";

interface DiscoveredDevice {
  ip: string;
  port: string;
}

type Status =
  | { kind: "pending"; message: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
  | { kind: "rediscover"; message: string; devices: DiscoveredDevice[] };

const isBrowser = typeof window !== "undefined";

/**
 * Bookmarklet redirect page. Auto-fires POST /app/bookmarklet on mount,
 * shows status, handles the "device IP changed" rediscovery flow, and
 * counts down to history.back() on success.
 */
export default class BookmarkletPage extends View {
  private data: BookmarkletData;
  private status = signal<Status>({ kind: "pending", message: "" });
  private countdown = signal<number | null>(null);
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(data: BookmarkletData) {
    super();
    this.data = data;
    this.status({ kind: "pending", message: `Sending to ${data.deviceName}…` });
  }

  render() {
    if (isBrowser) {
      // Defer until after hydration so this.el is bound.
      queueMicrotask(() => this.doSend());
    }

    const root = new Div().addClass("bml-page");
    const card = new Div().addClass("bml-card");

    card.append(
      new Div().addClass("bml-card__spinner").toggleAttribute("hidden", computed(() => this.status().kind !== "pending")),
      new P().addClass("bml-card__status")
        .toggleClass("bml-card__status--pending", computed(() => this.status().kind === "pending"))
        .toggleClass("bml-card__status--success", computed(() => this.status().kind === "success"))
        .toggleClass("bml-card__status--error", computed(() => this.status().kind === "error" || this.status().kind === "rediscover"))
        .setText(computed(() => this.status().message)),
      this.deviceListView(),
      new P().addClass("bml-card__countdown")
        .toggleAttribute("hidden", computed(() => this.countdown() === null))
        .setText(computed(() => this.countdown() === null ? "" : `Redirecting in ${this.countdown()}s…`)),
      new Button().addClass("btn").addClass("btn--ghost").addClass("bml-card__back")
        .toggleAttribute("hidden", computed(() => this.status().kind === "pending"))
        .on("click", () => {
          if (this.timer) clearInterval(this.timer);
          history.back();
        })
        .setText("Go back"),
    );

    return root.append(card);
  }

  private deviceListView() {
    const wrap = new Div().addClass("device-select-list");
    effect(() => {
      wrap.clear();
      const s = this.status();
      if (s.kind !== "rediscover") return;
      for (const d of s.devices) {
        wrap.append(
          new Button().addClass("device-select-list__btn").setText(`${d.ip}:${d.port}`)
            .on("click", () => this.pickDevice(d)),
          new P().addClass("bml-card__rediscover-hint").setText("Tap to confirm and resend"),
        );
      }
    });
    return wrap;
  }

  private async doSend(): Promise<void> {
    const { deviceName, articleUrl } = this.data;
    this.status({ kind: "pending", message: `Sending to ${deviceName}…` });
    try {
      const res = await fetch("/app/bookmarklet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device: deviceName, url: articleUrl }),
      });
      const data: {
        title?: string;
        error?: string;
        needsRediscovery?: boolean;
        devices?: DiscoveredDevice[];
      } = await res.json();

      if (data.needsRediscovery) {
        this.status({
          kind: "rediscover",
          message: this.rediscoverMessage(deviceName, data.devices ?? []),
          devices: data.devices ?? [],
        });
        return;
      }
      if (data.error) {
        this.status({ kind: "error", message: `Error: ${data.error}` });
        return;
      }
      this.status({ kind: "success", message: `Sent “${data.title}” to ${deviceName}.` });
      this.startCountdown();
    } catch (e) {
      this.status({ kind: "error", message: `Error: ${(e as Error).message}` });
    }
  }

  private rediscoverMessage(name: string, devices: DiscoveredDevice[]): string {
    if (devices.length === 0) {
      return `Could not reach ${name} and no CrossPoint devices were found. Make sure your device is in transfer mode and try again.`;
    }
    if (devices.length === 1) {
      return `Could not reach ${name} at its saved address, but found a CrossPoint device at a new address. Is this yours?`;
    }
    return `Could not reach ${name} at its saved address. Select your device below.`;
  }

  private async pickDevice(d: DiscoveredDevice): Promise<void> {
    this.status({ kind: "pending", message: "Updating device address…" });
    try {
      const res = await fetch(`/app/devices/${encodeURIComponent(this.data.deviceName)}/update-ip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: d.ip, port: d.port }),
      });
      const upd: { error?: string } = await res.json();
      if (upd.error) throw new Error(upd.error);
      await this.doSend();
    } catch (e) {
      this.status({ kind: "error", message: `Error: ${(e as Error).message}` });
    }
  }

  private startCountdown(): void {
    this.countdown(10);
    this.timer = setInterval(() => {
      const c = (this.countdown() ?? 0) - 1;
      this.countdown(c);
      if (c <= 0) {
        if (this.timer) clearInterval(this.timer);
        history.back();
      }
    }, 1000);
  }
}
