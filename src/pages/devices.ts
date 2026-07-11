import {
  View,
  Div,
  H1,
  Span,
  Table,
  Thead,
  Tr,
  Th,
  Td,
  Anchor,
  Button,
  P,
  Strong,
  List,
  signal,
  computed,
} from "@matthewp/zebra";
import type { DevicesData, DeviceItem } from "../loaders/devices.ts";
import { AddDeviceModal } from "../views/add-device-modal.ts";
import { Modal } from "../views/modal.ts";

export default class DevicesPage extends View {
  private devices = signal<DeviceItem[]>([]);

  // Modal state
  private addOpen = signal(false);
  private removeOpen = signal(false);
  private removeTarget = signal<string>("");
  private removeError = signal<string | null>(null);
  private removeInFlight = signal(false);

  constructor(data: DevicesData) {
    super();
    this.devices(data.devices);
  }

  render() {
    const count = computed(() => this.devices().length);

    const table = new Table().setAttribute("id", "device-table").addClass("device-list").append(
      new Thead().append(
        new Tr().addClass("device-list__header").append(
          new Th().setText("Name"),
          new Th().setText("Type"),
          new Th(),
        ),
      ),
      new List<DeviceItem>(
        this.devices,
        d => d.name,
        d => new DeviceRow(d, () => this.openRemove(d.name)),
        "tbody",
      ),
    );

    const empty = new P().addClass("devices-empty").setAttribute("id", "devices-empty").setText("No devices configured.");

    return new Div().addClass("container").append(
      new Div().addClass("page-header").append(
        new H1().addClass("page-header__title").append(
          "Devices ",
          new Span().addClass("page-header__count").setText(count),
        ),
        new Button().addClass("btn").addClass("btn--primary")
          .on("click", () => this.addOpen(true))
          .setText("Add Device"),
      ),
      // Show table or empty message depending on devices count.
      new Div().append(table).toggleAttribute("hidden", computed(() => count() === 0)),
      new Div().append(empty).toggleAttribute("hidden", computed(() => count() !== 0)),
      new AddDeviceModal({ open: this.addOpen, onAdded: () => this.refresh() }),
      this.renderRemoveModal(),
    );
  }

  private renderRemoveModal() {
    const body = new Div().append(
      new P().append(
        "Are you sure you want to remove ",
        new Strong().setText(this.removeTarget),
        "? This cannot be undone.",
      ),
      new P().addClass("modal__error")
        .toggleAttribute("hidden", computed(() => !this.removeError()))
        .setText(computed(() => this.removeError() ?? "")),
    );
    const footer = new Div().append(
      new Button().addClass("btn").addClass("btn--ghost")
        .on("click", () => this.removeOpen(false)).setText("Cancel"),
      new Button().addClass("btn").addClass("btn--danger")
        .setDisabled(this.removeInFlight)
        .setText(computed(() => this.removeInFlight() ? "Removing…" : "Remove"))
        .on("click", () => this.confirmRemove()),
    );
    return new Modal({
      id: "remove-device-modal",
      title: "Remove Device",
      open: this.removeOpen,
      body,
      footer,
    });
  }

  private openRemove(name: string): void {
    this.removeTarget(name);
    this.removeError(null);
    this.removeOpen(true);
  }

  private async confirmRemove(): Promise<void> {
    const name = this.removeTarget();
    this.removeError(null);
    this.removeInFlight(true);
    try {
      const res = await fetch("/app/devices/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data: { error?: string } = await res.json();
      if (data.error) { this.removeError(data.error); return; }
      this.devices(this.devices().filter(d => d.name !== name));
      this.removeOpen(false);
    } catch {
      this.removeError("Failed to remove device.");
    } finally {
      this.removeInFlight(false);
    }
  }

  private async refresh(): Promise<void> {
    try {
      const res = await fetch("/app/devices?_data=1", { headers: { accept: "application/json" } });
      if (!res.ok) return;
      const fresh = (await res.json()) as DevicesData;
      this.devices(fresh.devices);
    } catch { /* ignore */ }
  }
}

class DeviceRow extends View {
  private device: DeviceItem;
  private onRemove: () => void;

  constructor(device: DeviceItem, onRemove: () => void) {
    super();
    this.device = device;
    this.onRemove = onRemove;
  }

  render() {
    const d = this.device;
    const typeLabel = d.type.charAt(0).toUpperCase() + d.type.slice(1);
    return new Tr().addClass("device-list__row").setAttribute("data-device-name", d.name).append(
      new Td().addClass("device-list__col-name").append(
        new Anchor().setAttribute("href", `/app/devices/${encodeURIComponent(d.name)}`)
          .addClass("device-list__name-link").setText(d.name),
      ),
      new Td().addClass("device-list__col-type").setText(typeLabel),
      new Td().addClass("device-list__col-actions").append(
        new Button().addClass("device-list__remove-btn").setAttribute("aria-label", `Remove ${d.name}`)
          .on("click", () => this.onRemove())
          .setText("×"),
      ),
    );
  }
}
