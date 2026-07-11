import { View, Element, Div, Section, H1, H2, P, Form, Label, Input, Button, Span } from "@matthewp/zebra";
import type { SettingsData } from "../loaders/settings.ts";

export default class SettingsPage extends View {
  private data: SettingsData;

  constructor(data: SettingsData) {
    super();
    this.data = data;
  }

  render() {
    const main = new Element("main").addClass("main-content").setStyle("padding", "32px");
    main.append(
      new H1().setStyle("font-family", "var(--font-serif)").setStyle("font-size", "2.2em")
        .setStyle("font-weight", "800").setStyle("color", "var(--text-strong)").setStyle("margin-bottom", "32px")
        .setText("Settings"),
      ...this.flash(),
      this.opdsSection(),
      this.kosyncSection(),
    );
    return main;
  }

  private flash(): Element[] {
    const f = this.data.flash;
    if (!f) return [];
    return [new Div().addClass("settings-flash").addClass(f.kind === "success" ? "settings-flash--success" : "settings-flash--error").setText(f.message)];
  }

  private opdsSection() {
    const d = this.data;
    const section = new Section().addClass("settings-section").append(
      new H2().addClass("settings-section__heading").setText("OPDS Catalog"),
      new P().addClass("settings-section__sub").setText(
        "Enable OPDS to let e-reader apps browse and download books from your library. Configure a username and password that you'll enter in your reader app.",
      ),
    );
    if (d.opdsEnabled) {
      section.append(new P().addClass("settings-section__url").setText(d.opdsUrl));
    }
    section.append(this.settingsForm({
      action: "/app/settings/opds",
      enabled: d.opdsEnabled,
      enabledLabel: "Enable OPDS feeds",
      username: d.opdsUsername ?? "",
      usernameId: "opds-username",
      usernamePlaceholder: "lyceum",
      passwordId: "opds-password",
      passwordPlaceholder: d.opdsEnabled ? "Leave blank to keep current" : "Set a password",
    }));
    return section;
  }

  private kosyncSection() {
    const d = this.data;
    const section = new Section().addClass("settings-section").append(
      new H2().addClass("settings-section__heading").setText("KOSync (Reading Progress)"),
      new P().addClass("settings-section__sub").setText(
        "Enable KOSync to sync reading position across KOReader devices. Configure a username and password that you'll enter in KOReader's progress sync settings.",
      ),
    );
    if (d.kosyncEnabled) {
      section.append(new P().addClass("settings-section__url").setText(d.kosyncUrl));
    }
    section.append(this.settingsForm({
      action: "/app/settings/kosync",
      enabled: d.kosyncEnabled,
      enabledLabel: "Enable KOSync",
      username: d.kosyncUsername ?? "",
      usernameId: "kosync-username",
      usernamePlaceholder: "reader",
      passwordId: "kosync-password",
      passwordPlaceholder: d.kosyncEnabled ? "Leave blank to keep current" : "Set a password",
    }));
    return section;
  }

  private settingsForm(opts: {
    action: string;
    enabled: boolean;
    enabledLabel: string;
    username: string;
    usernameId: string;
    usernamePlaceholder: string;
    passwordId: string;
    passwordPlaceholder: string;
  }) {
    const enabledInput = new Input().setAttribute("type", "checkbox").setAttribute("name", "enabled").setAttribute("value", "true");
    if (opts.enabled) enabledInput.setAttribute("checked", "");

    return new Form().setAttribute("method", "POST").setAttribute("action", opts.action).addClass("settings-form").append(
      new Label().addClass("settings-form__toggle").append(
        enabledInput,
        new Span().addClass("settings-form__toggle-label").setText(opts.enabledLabel),
      ),
      new Div().addClass("settings-form__field").append(
        new Label().addClass("settings-form__label").setAttribute("for", opts.usernameId).setText("Username"),
        new Input().addClass("settings-form__input").setAttribute("id", opts.usernameId).setAttribute("name", "username")
          .setAttribute("type", "text").setAttribute("value", opts.username)
          .setAttribute("placeholder", opts.usernamePlaceholder).setAttribute("autocomplete", "off"),
      ),
      new Div().addClass("settings-form__field").append(
        new Label().addClass("settings-form__label").setAttribute("for", opts.passwordId).setText("Password"),
        new Input().addClass("settings-form__input").setAttribute("id", opts.passwordId).setAttribute("name", "password")
          .setAttribute("type", "password").setAttribute("placeholder", opts.passwordPlaceholder)
          .setAttribute("autocomplete", "new-password"),
      ),
      new Button().setAttribute("type", "submit").addClass("settings-form__submit").setText("Save"),
    );
  }
}
