import { View, Div, Anchor, H1, H2, P, Span, Code, Section } from "@matthewp/zebra";
import type { DeviceDetailData } from "../loaders/device-detail.ts";

export default class DeviceDetailPage extends View {
  private data: DeviceDetailData;

  constructor(data: DeviceDetailData) {
    super();
    this.data = data;
  }

  render() {
    const d = this.data;
    const typeLabel = d.type.charAt(0).toUpperCase() + d.type.slice(1);

    const root = new Div().addClass("container");

    root.append(
      new Div().addClass("page-header").append(
        new Div().addClass("page-header-left").append(
          new Anchor().setAttribute("href", "/app/devices").addClass("back-link").setText("← Devices"),
          new H1().addClass("page-title").append(
            d.name + " ",
            new Span().addClass("device-type-badge").setText(typeLabel),
          ),
        ),
      ),
    );

    if (d.ip) {
      root.append(
        new P().addClass("device-ip").append(
          "Registered address: ",
          new Code().addClass("device-ip-addr").setText(`${d.ip}:${d.port}`),
        ),
      );
    }

    root.append(
      new Section().addClass("device-section").append(
        new H2().addClass("section-title").setText("Bookmarklet"),
        new P().addClass("section-desc").setText(
          "Drag the button below to your browser's bookmarks bar. Clicking it on any article will send it to this device.",
        ),
        new Div().addClass("bookmarklet-wrap").append(
          new Anchor().setAttribute("href", d.bookmarkletHref)
            .setAttribute("draggable", "true")
            .addClass("bookmarklet-link")
            .setText(`Send to ${d.name}`),
        ),
        new P().addClass("bookmarklet-hint").setText("Drag to your bookmarks bar — don't click here."),
      ),
    );

    return root;
  }
}
