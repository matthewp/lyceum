import {
  View,
  Div,
  Label,
  Input,
  Select,
  Option,
  Button,
  P,
  Form,
  Element,
  signal,
  computed,
  effect,
} from "@matthewp/zebra";
import { Modal } from "./modal.ts";

type DeviceType = "boox" | "crosspoint" | "xteink";

interface AddSuccess {
  message: string;
  devices?: { ip: string; port: string }[];
}

export interface AddDeviceModalProps {
  open: ((value: boolean) => void) & (() => boolean);
  onAdded: () => void; // called after successful verify
}

/**
 * Multi-step add-device modal.
 *
 * Step 1: form fields (visibility depends on type)
 *   → POST /app/devices/add
 *     - on success with `devices`: step 2 shows the CrossPoint device picker
 *     - on success without devices:  step 2 shows the verification-code input
 *
 * Step 2: user picks a device or enters a code
 *   → POST /app/devices/verify
 *     - on success: call onAdded()
 */
export class AddDeviceModal extends View {
  private props: AddDeviceModalProps;

  // Form state
  private name = signal("");
  private type = signal<DeviceType>("boox");
  private email = signal("");
  private region = signal<"us" | "eu" | "cn">("us");
  private password = signal("");
  private ip = signal("");
  private port = signal("");

  // Flow state
  private step = signal<1 | 2>(1);
  private inFlight = signal(false);
  private error = signal<string | null>(null);
  private step2Message = signal("");
  private discoveredDevices = signal<{ ip: string; port: string }[]>([]);
  private code = signal("");

  constructor(props: AddDeviceModalProps) {
    super();
    this.props = props;
  }

  render() {
    // Reset form whenever the modal closes.
    effect(() => {
      if (!this.props.open()) this.reset();
    });

    const isCrossPoint = computed(() => this.type() === "crosspoint");
    const isBoox = computed(() => this.type() === "boox");

    const body = new Form().setAttribute("id", "add-device-form").setAttribute("onsubmit", "return false").append(
      // Step 1 panel
      new Div().setAttribute("id", "add-step-1").toggleAttribute("hidden", () => this.step() !== 1).append(
        this.field("Name", "device-name", () =>
          new Input().addClass("modal-input").setAttribute("id", "device-name")
            .setAttribute("placeholder", "My Boox").setAttribute("autocomplete", "off")
            .setValue(this.name).on("input", (e) => this.name((e.target as HTMLInputElement).value)),
        ),
        this.field("Type", "device-type", () =>
          new Select().addClass("modal-select").setAttribute("id", "device-type")
            .setValue(this.type)
            .on("change", (e) => this.type((e.target as HTMLSelectElement).value as DeviceType))
            .append(
              new Option().setAttribute("value", "boox").setText("Boox"),
              new Option().setAttribute("value", "crosspoint").setText("CrossPoint"),
              new Option().setAttribute("value", "xteink").setText("Xteink"),
            ),
        ),
        // Conditional fields
        this.conditionalField("Email", "device-email", computed(() => !isCrossPoint()), () =>
          new Input().addClass("modal-input").setAttribute("id", "device-email")
            .setAttribute("type", "email").setAttribute("autocomplete", "off")
            .setValue(this.email).on("input", (e) => this.email((e.target as HTMLInputElement).value)),
        ),
        this.conditionalField("Region", "device-region", isBoox, () =>
          new Select().addClass("modal-select").setAttribute("id", "device-region")
            .setValue(this.region)
            .on("change", (e) => this.region((e.target as HTMLSelectElement).value as "us" | "eu" | "cn"))
            .append(
              new Option().setAttribute("value", "us").setText("US"),
              new Option().setAttribute("value", "eu").setText("EU"),
              new Option().setAttribute("value", "cn").setText("CN"),
            ),
        ),
        this.conditionalField("Password", "device-password",
          computed(() => !isBoox() && !isCrossPoint()), () =>
          new Input().addClass("modal-input").setAttribute("id", "device-password")
            .setAttribute("type", "password")
            .setValue(this.password).on("input", (e) => this.password((e.target as HTMLInputElement).value)),
        ),
        this.conditionalField("IP Address", "device-ip", isCrossPoint, () =>
          new Input().addClass("modal-input").setAttribute("id", "device-ip")
            .setAttribute("placeholder", "192.168.1.100").setAttribute("autocomplete", "off")
            .setValue(this.ip).on("input", (e) => this.ip((e.target as HTMLInputElement).value)),
          " (optional — leave blank to auto-discover)",
        ),
        this.conditionalField("Port", "device-port", isCrossPoint, () =>
          new Input().addClass("modal-input").setAttribute("id", "device-port")
            .setAttribute("placeholder", "81").setAttribute("autocomplete", "off")
            .setValue(this.port).on("input", (e) => this.port((e.target as HTMLInputElement).value)),
          " (optional, default 81)",
        ),
      ),
      // Step 2 panel
      new Div().setAttribute("id", "add-step-2").toggleAttribute("hidden", () => this.step() !== 2).append(
        new P().addClass("add-message").setText(this.step2Message),
        // Either: device-selection list (CrossPoint with discovered devices)
        new Div().toggleAttribute("hidden", () => this.discoveredDevices().length === 0).append(
          this.deviceList(),
        ),
        // Or: code input
        new Div().toggleAttribute("hidden", () => this.discoveredDevices().length !== 0).append(
          new Label().addClass("modal-label").setText(
            computed(() => this.type() === "crosspoint" ? "Selection" : "Verification Code"),
          ),
          new Input().addClass("modal-input").setAttribute("autocomplete", "off")
            .setValue(this.code).on("input", (e) => this.code((e.target as HTMLInputElement).value)),
        ),
      ),
      new P().addClass("modal-error")
        .toggleAttribute("hidden", computed(() => !this.error()))
        .setText(computed(() => this.error() ?? "")),
    );

    const submitLabel = computed(() => {
      if (this.inFlight()) {
        return this.step() === 1
          ? (this.type() === "crosspoint" ? "Discovering…" : "Connecting…")
          : "Verifying…";
      }
      return this.step() === 1 ? "Add Device" : "Confirm";
    });

    const footer = new Div().append(
      new Button().addClass("btn").addClass("btn-ghost")
        .on("click", () => this.props.open(false)).setText("Cancel"),
      new Button().addClass("btn").addClass("btn-primary")
        .setDisabled(this.inFlight)
        // Hide the submit on step-2 device-picker (user clicks a device row).
        .toggleAttribute("hidden", computed(() => this.step() === 2 && this.discoveredDevices().length > 0))
        .on("click", () => this.submit())
        .setText(submitLabel),
    );

    return new Modal({
      id: "add-device-modal",
      title: "Add Device",
      open: this.props.open,
      body,
      footer,
    });
  }

  private field(label: string, id: string, mkInput: () => Element): Element {
    return new Div().addClass("modal-field").append(
      new Label().addClass("modal-label").setAttribute("for", id).setText(label),
      mkInput(),
    );
  }

  private conditionalField(
    label: string,
    id: string,
    show: () => boolean,
    mkInput: () => Element,
    hint?: string,
  ): Element {
    const labelEl = new Label().addClass("modal-label").setAttribute("for", id).append(label);
    if (hint) {
      labelEl.append(
        " ",
        new Element("span").setStyle("font-weight", "normal").setStyle("opacity", "0.6").setText(hint),
      );
    }
    return new Div().addClass("modal-field")
      .toggleAttribute("hidden", computed(() => !show()))
      .append(labelEl, mkInput());
  }

  private deviceList(): Element {
    const wrap = new Div().addClass("device-select-list");
    effect(() => {
      wrap.clear();
      this.discoveredDevices().forEach((d, i) => {
        wrap.append(
          new Button().setAttribute("type", "button").addClass("device-pick-btn")
            .setText(`${d.ip}:${d.port}`)
            .on("click", () => this.verifyWithSelection(String(i + 1))),
        );
      });
    });
    return wrap;
  }

  private reset(): void {
    this.step(1);
    this.inFlight(false);
    this.error(null);
    this.step2Message("");
    this.discoveredDevices([]);
    this.code("");
    this.name(""); this.email(""); this.password("");
    this.ip(""); this.port("");
  }

  private async submit(): Promise<void> {
    this.error(null);
    if (this.step() === 1) await this.submitStep1();
    else await this.submitStep2();
  }

  private async submitStep1(): Promise<void> {
    const type = this.type();
    const name = this.name().trim();
    const params: Record<string, string> = {};
    if (type === "crosspoint") {
      if (!name) { this.error("Name is required."); return; }
      if (this.ip().trim()) params.ip = this.ip().trim();
      if (this.port().trim()) params.port = this.port().trim();
    } else {
      const email = this.email().trim();
      if (!name || !email) { this.error("Name and email are required."); return; }
      params.email = email;
      if (type === "boox") params.region = this.region();
      else params.password = this.password();
    }

    this.inFlight(true);
    try {
      const res = await fetch("/app/devices/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, name, params }),
      });
      const data: AddSuccess & { error?: string } = await res.json();
      if (data.error) { this.error(data.error); return; }
      this.step2Message(data.message ?? "");
      this.discoveredDevices(data.devices ?? []);
      this.step(2);
    } catch {
      this.error("Connection failed.");
    } finally {
      this.inFlight(false);
    }
  }

  private async submitStep2(): Promise<void> {
    const code = this.code().trim();
    if (!code) {
      this.error(this.type() === "crosspoint" ? "Enter the selection number." : "Enter the verification code.");
      return;
    }
    const verifyParams: Record<string, string> = this.type() === "crosspoint" ? { selection: code } : { code };
    await this.runVerify(verifyParams);
  }

  private async verifyWithSelection(selection: string): Promise<void> {
    await this.runVerify({ selection });
  }

  private async runVerify(params: Record<string, string>): Promise<void> {
    this.inFlight(true);
    this.error(null);
    try {
      const res = await fetch("/app/devices/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: this.name().trim(), params }),
      });
      const data: { error?: string } = await res.json();
      if (data.error) { this.error(data.error); return; }
      this.props.open(false);
      this.props.onAdded();
    } catch {
      this.error("Verification failed.");
    } finally {
      this.inFlight(false);
    }
  }
}
