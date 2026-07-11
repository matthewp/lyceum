import {
  View,
  Div,
  Button,
  Anchor,
  P,
  Strong,
  Svg,
  Path,
  Polyline,
  Rect,
  Line,
  signal,
  computed,
  effect,
  type Element as ZebraElement,
} from "@matthewp/zebra";
import { Modal } from "./modal.ts";

interface DiscoveredDevice {
  ip: string;
  port: string;
}

type Step =
  | { kind: "actions" }
  | { kind: "confirm" }
  | { kind: "rediscover"; deviceName: string; message: string; devices: DiscoveredDevice[] };

type SignalRW<T> = ((value: T) => void) & (() => T);

export interface FormatModalProps {
  bookId: number;
  open: SignalRW<boolean>;
  format: SignalRW<string>;       // currently-selected format (badge clicked)
  deviceNames: string[];
  onRemoved: (format: string) => void;  // called when a format is successfully removed
}

/**
 * Per-format action modal: download the file, send to one of the user's
 * devices (with CrossPoint rediscovery flow on send-failure), or remove the
 * format entirely.
 */
export class FormatModal extends View {
  private props: FormatModalProps;

  private step = signal<Step>({ kind: "actions" });
  private sendStatus = signal<{ kind: "pending" | "success" | "error"; message: string } | null>(null);
  private removeInFlight = signal(false);
  private downloadHref = signal("#");
  private downloadFilename = signal("");

  constructor(props: FormatModalProps) {
    super();
    this.props = props;
  }

  render() {
    // Whenever the modal opens or format changes, reset state and prefetch
    // the signed download URL for that format.
    effect(() => {
      if (!this.props.open()) return;
      this.step({ kind: "actions" });
      this.sendStatus(null);
      this.removeInFlight(false);
      const fmt = this.props.format();
      if (!fmt) return;
      this.downloadHref("#");
      this.downloadFilename("");
      this.prefetchDownload(fmt);
    });

    const body = new Div().append(
      this.actionsView(),
      this.confirmView(),
      this.rediscoverView(),
    );

    const footer = new Button().addClass("btn").addClass("btn--ghost")
      .toggleAttribute("hidden", computed(() => this.step().kind === "confirm"))
      .on("click", () => this.props.open(false))
      .setText("Close");

    return new Modal({
      id: "format-modal",
      title: "",
      open: this.props.open,
      body,
      footer,
    });
  }

  private actionsView() {
    const wrap = new Div().setAttribute("id", "fmt-step-actions")
      .toggleAttribute("hidden", computed(() => this.step().kind !== "actions"));

    const list = new Div().addClass("fmt-action-list").append(
      new Anchor().addClass("fmt-action-list__btn").setAttribute("id", "fmt-download")
        .setAttribute("href", this.downloadHref)
        .setAttribute("download", this.downloadFilename)
        .append(downloadIcon(), "Download"),
      ...this.props.deviceNames.map(d =>
        new Button().addClass("fmt-action-list__btn").setAttribute("data-send-device", d)
          .append(deviceIcon(), `Send to ${d}`)
          .on("click", () => this.doSend(d)),
      ),
      new Button().addClass("fmt-action-list__btn").addClass("fmt-action-list__btn--danger")
        .append(trashIcon(), "Remove format")
        .on("click", () => this.step({ kind: "confirm" })),
    );

    const status = new P().addClass("fmt-send-status")
      .toggleAttribute("hidden", computed(() => this.sendStatus() === null))
      .toggleClass("fmt-send-status--success", computed(() => this.sendStatus()?.kind === "success"))
      .toggleClass("fmt-send-status--error", computed(() => this.sendStatus()?.kind === "error"))
      .setText(computed(() => this.sendStatus()?.message ?? ""));

    return wrap.append(list, status);
  }

  private confirmView() {
    const fmt = this.props.format;
    return new Div().setAttribute("id", "fmt-step-confirm")
      .toggleAttribute("hidden", computed(() => this.step().kind !== "confirm"))
      .append(
        new P().append("Are you sure you want to remove ", new Strong().setText(fmt),
          " from this book? This cannot be undone."),
        new Div().addClass("fmt-confirm-buttons").append(
          new Button().addClass("btn").addClass("btn--ghost")
            .on("click", () => this.step({ kind: "actions" }))
            .setText("Cancel"),
          new Button().addClass("btn").addClass("btn--danger")
            .setDisabled(this.removeInFlight)
            .setText(computed(() => this.removeInFlight() ? "Removing…" : "Remove"))
            .on("click", () => this.confirmRemove()),
        ),
      );
  }

  private rediscoverView() {
    const wrap = new Div().setAttribute("id", "fmt-step-rediscover")
      .toggleAttribute("hidden", computed(() => this.step().kind !== "rediscover"));

    const msg = new P().addClass("rediscover-message")
      .setText(computed(() => {
        const s = this.step();
        return s.kind === "rediscover" ? s.message : "";
      }));

    const list = new Div().addClass("device-select-list");
    effect(() => {
      list.clear();
      const s = this.step();
      if (s.kind !== "rediscover") return;
      for (const d of s.devices) {
        list.append(
          new Button().setAttribute("type", "button").addClass("device-select-list__btn")
            .setText(`${d.ip}:${d.port}`)
            .on("click", () => this.pickDevice(d)),
        );
      }
    });

    const err = new P().addClass("modal__error")
      .toggleAttribute("hidden", computed(() => this.sendStatus()?.kind !== "error"))
      .setText(computed(() => this.sendStatus()?.message ?? ""));

    return wrap.append(msg, list, err);
  }

  private async prefetchDownload(format: string): Promise<void> {
    try {
      const res = await fetch(`/app/book/${this.props.bookId}/download-url?format=${encodeURIComponent(format)}`);
      const data: { url?: string; filename?: string } = await res.json();
      if (data.url) {
        this.downloadHref(data.url);
        this.downloadFilename(data.filename ?? "");
      }
    } catch { /* ignore */ }
  }

  private async doSend(deviceName: string): Promise<void> {
    const format = this.props.format();
    this.sendStatus({ kind: "pending", message: `Sending to ${deviceName}…` });
    try {
      const res = await fetch(`/app/book/${this.props.bookId}/send-to-device`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `format=${encodeURIComponent(format)}&device=${encodeURIComponent(deviceName)}`,
      });
      const data: {
        error?: string;
        needsRediscovery?: boolean;
        devices?: DiscoveredDevice[];
      } = await res.json();
      if (data.needsRediscovery) {
        const devs = data.devices ?? [];
        this.sendStatus(null);
        this.step({
          kind: "rediscover",
          deviceName,
          message: this.rediscoverMessage(deviceName, devs),
          devices: devs,
        });
        return;
      }
      if (data.error) throw new Error(data.error);
      this.sendStatus({ kind: "success", message: `Sent to ${deviceName}` });
    } catch (e) {
      this.sendStatus({ kind: "error", message: (e as Error).message || "Failed to send" });
    }
  }

  private rediscoverMessage(name: string, devs: DiscoveredDevice[]): string {
    if (devs.length === 0) {
      return `Could not reach ${name} and no CrossPoint devices were found on the network. Make sure your device is in transfer mode and try again.`;
    }
    if (devs.length === 1) {
      return `Could not reach ${name} at its saved address. A CrossPoint device was found at a new address — is this your device?`;
    }
    return `Could not reach ${name} at its saved address. Select your device from the list below.`;
  }

  private async pickDevice(d: DiscoveredDevice): Promise<void> {
    const s = this.step();
    if (s.kind !== "rediscover") return;
    const deviceName = s.deviceName;
    try {
      const res = await fetch(`/app/devices/${encodeURIComponent(deviceName)}/update-ip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ip: d.ip, port: d.port }),
      });
      const upd: { error?: string } = await res.json();
      if (upd.error) throw new Error(upd.error);
      this.step({ kind: "actions" });
      await this.doSend(deviceName);
    } catch (e) {
      this.sendStatus({ kind: "error", message: (e as Error).message || "Failed to update device address." });
    }
  }

  private async confirmRemove(): Promise<void> {
    const format = this.props.format();
    this.removeInFlight(true);
    try {
      const res = await fetch(`/app/book/${this.props.bookId}/remove-format`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `format=${encodeURIComponent(format)}`,
      });
      const data: { error?: string } = await res.json();
      if (data.error) throw new Error(data.error);
      this.props.onRemoved(format);
      this.props.open(false);
    } catch (e) {
      this.sendStatus({ kind: "error", message: (e as Error).message || "Failed to remove format" });
      this.step({ kind: "actions" });
    } finally {
      this.removeInFlight(false);
    }
  }
}

function downloadIcon(): Svg {
  return iconSvg(
    new Path().setAttribute("d", "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"),
    new Polyline().setAttribute("points", "7 10 12 15 17 10"),
    new Line().setAttribute("x1", "12").setAttribute("y1", "15").setAttribute("x2", "12").setAttribute("y2", "3"),
  );
}

function deviceIcon(): Svg {
  return iconSvg(
    new Rect().setAttribute("x", "4").setAttribute("y", "2").setAttribute("width", "16").setAttribute("height", "20").setAttribute("rx", "2"),
    new Line().setAttribute("x1", "12").setAttribute("y1", "18").setAttribute("x2", "12.01").setAttribute("y2", "18"),
  );
}

function trashIcon(): Svg {
  return iconSvg(
    new Polyline().setAttribute("points", "3 6 5 6 21 6"),
    new Path().setAttribute("d", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"),
  );
}

function iconSvg(...children: ZebraElement[]): Svg {
  return new Svg()
    .setAttribute("xmlns", "http://www.w3.org/2000/svg")
    .setAttribute("width", "16").setAttribute("height", "16").setAttribute("viewBox", "0 0 24 24")
    .setAttribute("fill", "none").setAttribute("stroke", "currentColor").setAttribute("stroke-width", "2")
    .setAttribute("stroke-linecap", "round").setAttribute("stroke-linejoin", "round")
    .append(...children);
}
